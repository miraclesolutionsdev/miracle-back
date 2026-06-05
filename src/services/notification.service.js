import { getNotificationModel } from '../models/notification.model.js'
import { sseService } from './sse.service.js'

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
 * Nunca lanza para no romper el flujo principal.
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
