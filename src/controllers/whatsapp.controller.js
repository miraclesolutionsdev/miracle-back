import { MercadoPagoConfig, Preference } from 'mercadopago'
import { getProductoModel } from '../models/producto.model.js'
import { getOrdenModel } from '../models/orden.model.js'
import { getTicketModel } from '../models/ticket.model.js'
import { getClienteModel } from '../models/cliente.model.js'
import { getLeadWhatsappModel } from '../models/leadWhatsapp.model.js'
import { generarNumeroOrden } from '../utils/ordenUtils.js'

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
})

function validarApiKey(req, res) {
  const key = (process.env.WHATSAPP_API_KEY || '').trim()
  if (!key) {
    res.status(503).json({ error: 'Endpoint no configurado. Falta WHATSAPP_API_KEY.' })
    return false
  }
  const provided = (req.headers['x-api-key'] || '').trim()
  if (!provided || provided !== key) {
    res.status(401).json({ error: 'API key inválida.' })
    return false
  }
  return true
}

export async function crearOrdenWhatsApp(req, res) {
  if (!validarApiKey(req, res)) return
  try {
    const {
      nombre, telefono,
      ciudad = '', ciudadBarrio = '', direccion = '',
      producto: productoNombre,
      talla = '', color = '',
      cantidad: cantidadRaw = 1,
    } = req.body
    if (!nombre || !telefono || !productoNombre) {
      return res.status(400).json({ error: 'Faltan datos requeridos: nombre, telefono, producto' })
    }
    const cantidad = Math.max(1, Math.min(99, parseInt(cantidadRaw) || 1))
    const Producto = getProductoModel(req.db)
    const producto = await Producto.findOne({
      nombre: { $regex: productoNombre.trim(), $options: 'i' },
      estado: 'activo',
    })
    if (!producto) {
      return res.status(404).json({ error: `No se encontró el producto "${productoNombre}" en el catálogo activo.` })
    }
    const itemTitle = [producto.nombre, talla && `Talla ${talla}`, color].filter(Boolean).join(' - ')
    const ciudadFinal = ciudadBarrio || ciudad
    const FRONT_URL = process.env.FRONT_URL || 'https://www.miraclesolutions.com.co'
    const preference = new Preference(client)
    const mpResult = await preference.create({
      body: {
        items: [{ id: producto._id.toString(), title: itemTitle, description: itemTitle, quantity: cantidad, unit_price: Number(producto.precio), currency_id: 'COP' }],
        back_urls: {
          success: `${FRONT_URL}/pago/exitoso`,
          failure: `${FRONT_URL}/pago/fallido`,
          pending: `${FRONT_URL}/pago/pendiente`,
        },
        ...(FRONT_URL.startsWith('https') && { auto_return: 'approved' }),
        statement_descriptor: 'Miracle Solutions',
        metadata: {
          origen: 'whatsapp', productoId: producto._id.toString(), tenantSlug: req.tenantSlug,
          cantidad, clienteNombre: nombre, clienteCelular: telefono,
          talla, color, envioDireccion: direccion, envioBarrio: ciudadFinal,
        },
      },
    })
    const preferenceId = mpResult.id
    const linkPago     = mpResult.init_point
    const Cliente = getClienteModel(req.db)
    const cliente = await Cliente.findOneAndUpdate(
      { whatsapp: telefono },
      {
        $set: { nombreEmpresa: nombre, whatsapp: telefono, ...(ciudadFinal && { ciudadBarrio: ciudadFinal }), ...(direccion && { direccion }), estado: 'activo' },
        $setOnInsert: { email: '' },
      },
      { upsert: true, new: true }
    )
    const ordenNumero = await generarNumeroOrden(req.db)
    const Orden  = getOrdenModel(req.db)
    const Ticket = getTicketModel(req.db)
    const nuevaOrden = await Orden.create({
      ordenNumero, clienteId: cliente._id,
      cliente: { nombre, email: '', whatsapp: telefono, cedula: '' },
      envio: { direccion, barrio: ciudadFinal },
      productos: [{ productoId: producto._id, productoNombre: producto.nombre, cantidad, precioUnitario: Number(producto.precio), precioTotal: Number(producto.precio) * cantidad }],
      totalMonto: Number(producto.precio) * cantidad,
      estado: 'pendiente', estadoPago: 'no_pagado', estadoPreparacion: 'no_preparado',
      origen: 'whatsapp', metodoPago: 'mercadopago', preferenceId, talla, color,
    })
    await Ticket.create({
      numeroTicket: `TK-${ordenNumero}`,
      ordenId: nuevaOrden._id,
      tipo: 'creacion',
      descripcion: [
        `Orden creada desde WhatsApp (ElevenLabs).`,
        `Cliente: ${nombre} | Tel: ${telefono}`,
        `Producto: ${itemTitle}${cantidad > 1 ? ` x${cantidad}` : ''}`,
        `Barrio/Ciudad: ${ciudadFinal || 'No indicado'}`,
        `Dirección: ${direccion || 'No indicada'}`,
      ].join(' | '),
      creador: 'whatsapp-bot',
    })
    console.log(`[WA] ✓ Orden ${ordenNumero} | ${nombre} | ${producto.nombre}${talla ? ` T:${talla}` : ''}${color ? ` C:${color}` : ''}`)
    return res.json({ ok: true, orden_numero: ordenNumero, link_pago: linkPago, mensaje: `Orden #${ordenNumero} registrada. Link de pago: ${linkPago}` })
  } catch (err) {
    console.error('[WA] Error creando orden:', err.message)
    return res.status(500).json({ error: 'Error interno al crear la orden.' })
  }
}

// ── Conversaciones ElevenLabs ─────────────────────────────────────────────

const EL_BASE = 'https://api.elevenlabs.io'

function elHeaders() {
  return {
    'xi-api-key': (process.env.ELEVENLABS_API_KEY || '').trim(),
    'Content-Type': 'application/json',
  }
}

export async function listarConversaciones(req, res) {
  // Usar el agentId propio del tenant; si no tiene, retornar vacío
  const agentId = (req.elevenLabsAgentId || '').trim()
  const apiKey  = (process.env.ELEVENLABS_API_KEY || '').trim()
  if (!agentId || !apiKey) {
    return res.json({ conversations: [], has_more: false, next_cursor: null })
  }
  try {
    const { page_size = 50, cursor } = req.query
    const params = new URLSearchParams({ agent_id: agentId, page_size })
    if (cursor) params.set('cursor', cursor)
    const r = await fetch(`${EL_BASE}/v1/convai/conversations?${params}`, { headers: elHeaders() })
    const data = await r.json()
    if (!r.ok) {
      console.error('[EL] Error listando conversaciones:', data)
      return res.status(r.status).json({ error: data.detail?.message || 'Error al obtener conversaciones de ElevenLabs' })
    }
    return res.json(data)
  } catch (err) {
    console.error('[EL] Error:', err.message)
    return res.status(500).json({ error: 'Error interno al consultar ElevenLabs.' })
  }
}

export async function obtenerConversacion(req, res) {
  const apiKey = (process.env.ELEVENLABS_API_KEY || '').trim()
  if (!apiKey) {
    return res.status(503).json({ error: 'Falta ELEVENLABS_API_KEY en las variables de entorno.' })
  }
  try {
    const { id } = req.params
    const r = await fetch(`${EL_BASE}/v1/convai/conversations/${id}`, { headers: elHeaders() })
    const data = await r.json()
    if (!r.ok) {
      console.error('[EL] Error obteniendo conversación:', data)
      return res.status(r.status).json({ error: data.detail?.message || 'Error al obtener conversación de ElevenLabs' })
    }
    return res.json(data)
  } catch (err) {
    console.error('[EL] Error:', err.message)
    return res.status(500).json({ error: 'Error interno al consultar ElevenLabs.' })
  }
}

// ── Webhook de ElevenLabs (conversaciones) ────────────────────────────────

/**
 * Webhook para recibir notificaciones de conversaciones de ElevenLabs.
 * Esta ruta es pública y será llamada por ElevenLabs cuando:
 * - Una conversación se inicia
 * - Una conversación se completa
 * - Una conversación falla
 */
export async function recibirWebhookConversacion(req, res) {
  try {
    // Validar API key para seguridad
    if (!validarApiKey(req, res)) return

    const payload = req.body
    console.log('[EL Webhook] Conversación recibida:', JSON.stringify(payload, null, 2))

    // Extraer datos del payload de ElevenLabs
    const {
      conversation_id,
      agent_id,
      status,
      start_time_unix_secs,
      call_duration_secs,
      transcript = [],
      metadata = {},
    } = payload

    if (!conversation_id || !agent_id) {
      return res.status(400).json({ error: 'Faltan datos requeridos: conversation_id, agent_id' })
    }

    // req.db ya fue inyectado por webhookTenantMiddleware
    const LeadWhatsapp = getLeadWhatsappModel(req.db)

    // Extraer número de teléfono si está en metadata o transcript
    let phoneNumber = metadata?.phone_number || metadata?.caller_number || null
    if (!phoneNumber && transcript.length > 0) {
      // Intentar extraer de mensajes del usuario que contengan números
      const userMessages = transcript.filter(m => m.role === 'user').map(m => m.message).join(' ')
      const phoneMatch = userMessages.match(/\+?\d{10,15}/)
      phoneNumber = phoneMatch ? phoneMatch[0] : null
    }

    // Normalizar transcript al formato esperado
    const normalizedTranscript = transcript.map(msg => ({
      role: msg.role || 'user',
      message: msg.message || msg.text || '',
      time: msg.time || msg.timestamp || 0,
    }))

    // Crear o actualizar el lead
    const lead = await LeadWhatsapp.findOneAndUpdate(
      { conversationId: conversation_id },
      {
        $set: {
          agentId: agent_id,
          status: status || 'other',
          startTimeUnixSecs: start_time_unix_secs || Math.floor(Date.now() / 1000),
          callDurationSecs: call_duration_secs || 0,
          messageCount: normalizedTranscript.length,
          transcript: normalizedTranscript,
          metadata,
          phoneNumber,
        },
      },
      { upsert: true, new: true }
    )

    console.log(`[EL Webhook] ✓ Lead guardado: ${conversation_id} | Tenant: ${req.tenantSlug} | Tel: ${phoneNumber || 'N/A'}`)

    return res.json({ ok: true, lead_id: lead._id, tenant: req.tenantSlug })
  } catch (err) {
    console.error('[EL Webhook] Error procesando webhook:', err.message)
    return res.status(500).json({ error: 'Error interno al procesar webhook.' })
  }
}

// ── Listar Leads desde BD Local ──────────────────────────────────────────

/**
 * Lista las conversaciones/leads de WhatsApp desde la base de datos local.
 * Reemplaza la consulta directa a ElevenLabs API.
 */
export async function listarLeadsWhatsapp(req, res) {
  try {
    const LeadWhatsapp = getLeadWhatsappModel(req.db)

    const {
      page = 1,
      limit = 50,
      status,
      estadoLead,
    } = req.query

    const filter = {}
    if (status) filter.status = status
    if (estadoLead) filter.estadoLead = estadoLead

    const pageNum = Math.max(1, parseInt(page) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50))
    const skip = (pageNum - 1) * limitNum

    const [leads, total] = await Promise.all([
      LeadWhatsapp.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      LeadWhatsapp.countDocuments(filter),
    ])

    return res.json({
      leads,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    })
  } catch (err) {
    console.error('[Leads WA] Error listando leads:', err.message)
    return res.status(500).json({ error: 'Error al listar leads de WhatsApp.' })
  }
}

/**
 * Obtiene el detalle de un lead específico desde la BD local.
 */
export async function obtenerLeadWhatsapp(req, res) {
  try {
    const LeadWhatsapp = getLeadWhatsappModel(req.db)
    const { id } = req.params

    const lead = await LeadWhatsapp.findById(id).lean()
    if (!lead) {
      return res.status(404).json({ error: 'Lead no encontrado.' })
    }

    return res.json(lead)
  } catch (err) {
    console.error('[Leads WA] Error obteniendo lead:', err.message)
    return res.status(500).json({ error: 'Error al obtener lead de WhatsApp.' })
  }
}

/**
 * Actualiza el estado o notas de un lead.
 */
export async function actualizarLeadWhatsapp(req, res) {
  try {
    const LeadWhatsapp = getLeadWhatsappModel(req.db)
    const { id } = req.params
    const { estadoLead, notas } = req.body

    const updates = {}
    if (estadoLead) updates.estadoLead = estadoLead
    if (notas !== undefined) updates.notas = notas

    const lead = await LeadWhatsapp.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    ).lean()

    if (!lead) {
      return res.status(404).json({ error: 'Lead no encontrado.' })
    }

    return res.json(lead)
  } catch (err) {
    console.error('[Leads WA] Error actualizando lead:', err.message)
    return res.status(500).json({ error: 'Error al actualizar lead de WhatsApp.' })
  }
}
