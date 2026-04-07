import jwt from 'jsonwebtoken'
import { getNotificationModel } from '../models/notification.model.js'
import { sseService } from '../services/sse.service.js'

const JWT_SECRET = process.env.JWT_SECRET

function formatNotif(n) {
  return {
    id: n._id?.toString(),
    tipo: n.tipo,
    titulo: n.titulo,
    mensaje: n.mensaje,
    leida: n.leida,
    meta: n.meta ?? {},
    createdAt: n.createdAt,
  }
}

/**
 * Crea una notificación en MongoDB y la emite por SSE a todos los clientes del tenant.
 * Se usa desde otros controllers — nunca lanza para no romper el flujo principal.
 */
export async function crearYEmitir(db, tenantDbName, { tipo, titulo, mensaje, meta = {} }) {
  try {
    const Notification = getNotificationModel(db)
    const notif = await Notification.create({ tipo, titulo, mensaje, meta })
    sseService.emit(tenantDbName, { evento: 'notificacion', data: formatNotif(notif) })
  } catch (err) {
    console.error('[Notificaciones] Error al crear/emitir:', err.message)
  }
}

// ─── Auth inline para SSE (EventSource no soporta headers personalizados) ────
function resolveToken(req) {
  return (
    req.cookies?.miracle_token ||
    req.query?.token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null)
  )
}

function verifyToken(token) {
  if (!token) return null
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    return decoded.userId || null
  } catch {
    return null
  }
}

// ─── Endpoint SSE ─────────────────────────────────────────────────────────────
export function stream(req, res) {
  const token = resolveToken(req)
  if (!verifyToken(token)) {
    res.status(401).end()
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // nginx: deshabilita buffering
  res.flushHeaders()

  const tenantDbName = req.tenantDbName
  sseService.subscribe(tenantDbName, res)

  // Confirmar conexión al cliente
  res.write(`data: ${JSON.stringify({ evento: 'conectado' })}\n\n`)

  // Heartbeat cada 25s para mantener la conexión viva en proxies y Vercel
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n')
    } catch {
      clearInterval(heartbeat)
    }
  }, 25000)

  req.on('close', () => {
    clearInterval(heartbeat)
    sseService.unsubscribe(tenantDbName, res)
  })
}

// ─── REST endpoints ───────────────────────────────────────────────────────────
export async function listar(req, res) {
  try {
    const Notification = getNotificationModel(req.db)
    const notifs = await Notification.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
    res.json(notifs.map(formatNotif))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function marcarTodasLeidas(req, res) {
  try {
    const Notification = getNotificationModel(req.db)
    await Notification.updateMany({ leida: false }, { leida: true })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function marcarLeida(req, res) {
  try {
    const Notification = getNotificationModel(req.db)
    await Notification.findByIdAndUpdate(req.params.id, { leida: true })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
