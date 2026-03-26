import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'
import crypto from 'crypto'
import Producto from '../models/producto.model.js'
import Venta from '../models/venta.model.js'
import Orden from '../models/orden.model.js'
import Ticket from '../models/ticket.model.js'
import Cliente from '../models/cliente.model.js'
import { generarNumeroOrden } from '../utils/ordenUtils.js'

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
})

/**
 * Valida la firma HMAC-SHA256 del webhook de MercadoPago.
 * Documentación: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
 *
 * Requiere la variable de entorno MP_WEBHOOK_SECRET configurada en el dashboard de MP.
 * Si no está configurada, se registra una advertencia y se permite el paso (útil en desarrollo).
 */
function validateWebhookSignature(req) {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) {
    console.warn('[MP] MP_WEBHOOK_SECRET no configurado. Validación de firma omitida.')
    return true
  }

  const xSignature = req.headers['x-signature']
  const xRequestId = req.headers['x-request-id']
  const dataId = req.body?.data?.id

  if (!xSignature || !xRequestId || dataId == null) {
    console.warn('[MP] Webhook sin headers de firma requeridos.')
    return false
  }

  // Parsear "ts=<timestamp>,v1=<hash>"
  let ts, v1
  for (const part of xSignature.split(',')) {
    const [key, value] = part.trim().split('=')
    if (key === 'ts') ts = value
    if (key === 'v1') v1 = value
  }

  if (!ts || !v1) {
    console.warn('[MP] Cabecera x-signature mal formada.')
    return false
  }

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts}`
  const computed = crypto.createHmac('sha256', secret).update(manifest).digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(v1, 'hex'))
  } catch {
    return false
  }
}

export async function crearPreferencia(req, res) {
  try {
    const { productoId } = req.body
    if (!productoId) {
      return res.status(400).json({ error: 'productoId es requerido' })
    }

    const producto = await Producto.findById(productoId)
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' })
    }
    if (producto.estado !== 'activo') {
      return res.status(400).json({ error: 'Producto no disponible' })
    }

    const FRONT_URL = process.env.FRONT_URL || 'https://www.miraclesolutions.com.co'
    const preference = new Preference(client)
    const result = await preference.create({
      body: {
        items: [
          {
            id: producto._id.toString(),
            title: producto.nombre,
            description: producto.descripcion || producto.nombre,
            quantity: 1,
            unit_price: Number(producto.precio),
            currency_id: 'COP',
          },
        ],
        back_urls: {
          success: `${FRONT_URL}/pago/exitoso`,
          failure: `${FRONT_URL}/pago/fallido`,
          pending: `${FRONT_URL}/pago/pendiente`,
        },
        ...(FRONT_URL.startsWith('https') && { auto_return: 'approved' }),
        statement_descriptor: 'Miracle Solutions',
        metadata: { productoId: producto._id.toString() },
      },
    })

    res.json({ init_point: result.init_point })
  } catch (err) {
    console.error('[MP] Error al crear preferencia:', err)
    res.status(500).json({ error: 'Error al crear la preferencia de pago' })
  }
}

export async function recibirWebhook(req, res) {
  // Validar firma SOLO en producción
  const isProduction = process.env.NODE_ENV === 'production'
  if (isProduction && !validateWebhookSignature(req)) {
    console.error('[MP] Firma de webhook inválida — solicitud rechazada.')
    return res.status(401).json({ error: 'Firma inválida' })
  }
  if (!isProduction) {
    console.log('[DEV] Validación HMAC omitida en desarrollo')
  }

  try {
    const { type, data } = req.body

    if (type !== 'payment' || !data?.id) {
      console.log('[MP] Webhook ignorado: tipo no es payment o sin data.id')
      return res.sendStatus(200)
    }

    const paymentId = Number(data.id)
    const paymentApi = new Payment(client)
    const pago = await paymentApi.get({ id: paymentId })

    console.log(`[MP] Webhook recibido - PaymentID: ${paymentId}, Status: ${pago.status}`)

    if (pago.status !== 'approved') {
      console.log(`[MP] Pago no aprobado (status: ${pago.status}), ignorando webhook`)
      return res.sendStatus(200)
    }

    // Extrae productId de metadata
    const productoId = pago.metadata?.producto_id || pago.metadata?.productoId
    if (!productoId) {
      console.error('[MP] No se encontró productoId en metadata del pago:', paymentId)
      return res.sendStatus(200)
    }

    // Valida que producto existe
    const producto = await Producto.findById(productoId)
    if (!producto) {
      console.error('[MP] Producto no encontrado:', productoId)
      return res.sendStatus(200)
    }

    // ===== CREAR ORDEN AUTOMÁTICAMENTE =====
    console.log(`[MP] Creando orden para producto: ${producto.nombre}`)

    // Extrae datos del comprador del pago
    const emailComprador = pago.payer?.email || 'desconocido@nointent.com'
    const nombreComprador = pago.payer?.first_name || pago.additional_info?.items?.[0]?.title || 'Comprador'

    // Buscar o crear cliente
    let cliente = await Cliente.findOne({ email: emailComprador })
    if (!cliente) {
      console.log(`[MP] Cliente no existe, creando: ${emailComprador}`)
      cliente = await Cliente.create({
        nombreEmpresa: nombreComprador,
        email: emailComprador,
        whatsapp: pago.payer?.phone?.number || '',
        estado: 'activo',
      })
    }

    // Generar número de orden
    const ordenNumero = await generarNumeroOrden()

    // Crear orden
    const nuevaOrden = await Orden.create({
      ordenNumero,
      clienteId: cliente._id,
      cliente: {
        nombre: cliente.nombreEmpresa,
        email: cliente.email,
        whatsapp: cliente.whatsapp || '',
      },
      productos: [
        {
          productoId: producto._id,
          productoNombre: producto.nombre,
          cantidad: 1,
          precioUnitario: Number(pago.transaction_amount ?? 0),
          precioTotal: Number(pago.transaction_amount ?? 0),
        },
      ],
      totalMonto: Number(pago.transaction_amount ?? 0),
      estado: 'pendiente',
      metodoPago: 'mercadopago',
      pagoId: String(paymentId),
    })

    console.log(`[MP] ✓ Orden creada: ${ordenNumero}`)

    // Crear ticket automático de pago recibido
    const ticket = await Ticket.create({
      numeroTicket: `TK-${ordenNumero}`,
      ordenId: nuevaOrden._id,
      tipo: 'pago_recibido',
      descripcion: `Pago aprobado en MercadoPago (ID: ${paymentId}). Monto: $${pago.transaction_amount}`,
      creador: 'sistema-mercadopago',
    })

    console.log(`[MP] ✓ Ticket creado: ${ticket.numeroTicket}`)

    // Decrementar stock
    if (producto.stock > 0) {
      await Producto.findByIdAndUpdate(productoId, { $inc: { stock: -1 } })
      console.log(`[MP] ✓ Stock decrementado: ${producto.nombre}`)
    }

    // Crear registro de Venta para compatibilidad con sistema anterior
    await Venta.updateOne(
      { pagoId: String(paymentId) },
      {
        $setOnInsert: {
          pagoId: String(paymentId),
          ordenId: nuevaOrden._id,
          productoId: producto._id,
          productoNombre: producto.nombre,
          monto: pago.transaction_amount ?? 0,
          estado: 'aprobado',
          metodoPago: pago.payment_method_id ?? 'mercadopago',
        },
      },
      { upsert: true }
    )

    console.log(`[MP] ✓ Orden procesada completamente: ${ordenNumero}`)
  } catch (err) {
    console.error('[MP] Error procesando webhook:', err.message, err.stack)
  }

  // Siempre retornar 200 a MercadoPago
  res.sendStatus(200)
}

// Endpoint para DESARROLLO LOCAL ÚNICAMENTE
export async function webhookTest(req, res) {
  // Bloqueado en producción
  if (process.env.NODE_ENV === 'production') return res.status(403).send('No disponible')

  // Simula un webhook completo de MP
  const mockWebhookBody = {
    type: 'payment',
    data: {
      id: Math.floor(Math.random() * 1000000000)
    }
  }

  // Procesa como si fuera un webhook real
  req.body = mockWebhookBody
  return recibirWebhook(req, res)
}
