import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'
import crypto from 'crypto'
import { getProductoModel } from '../models/producto.model.js'
import { getOrdenModel } from '../models/orden.model.js'
import { getTicketModel } from '../models/ticket.model.js'
import { getClienteModel } from '../models/cliente.model.js'
import { generarNumeroOrden } from '../utils/ordenUtils.js'

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
})

function validateWebhookSignature(req) {
  const secret = (process.env.MP_WEBHOOK_SECRET || '').trim()
  if (!secret) {
    console.error('[MP] MP_WEBHOOK_SECRET no configurado.')
    return false
  }
  const xSignature = req.headers['x-signature']
  const xRequestId = req.headers['x-request-id']
  if (!xSignature || !xRequestId) {
    console.warn('[MP] Headers de firma ausentes (x-signature / x-request-id).')
    return false
  }
  const dataId =
    req.query?.['data.id'] ??
    req.query?.data?.id ??
    req.body?.data?.id
  if (!dataId) {
    console.warn('[MP] No se encontró data.id en query ni en body.')
    return false
  }
  let ts, v1
  for (const part of xSignature.split(',')) {
    const eqIdx = part.trim().indexOf('=')
    if (eqIdx === -1) continue
    const key   = part.trim().slice(0, eqIdx)
    const value = part.trim().slice(eqIdx + 1)
    if (key === 'ts') ts = value
    if (key === 'v1') v1 = value
  }
  if (!ts || !v1) {
    console.warn('[MP] Cabecera x-signature mal formada:', xSignature)
    return false
  }
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts}`
  const computed = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
  console.log('[MP] manifest :', manifest)
  console.log('[MP] computed  :', computed)
  console.log('[MP] v1 recibido:', v1)
  try {
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(v1, 'hex'))
  } catch {
    return false
  }
}

export async function crearPreferencia(req, res) {
  try {
    const {
      productoId,
      cantidad: cantidadRaw = 1,
      clienteNombre,
      clienteCelular,
      clienteEmail,
      clienteCedula,
      envioDireccion,
      envioBarrio,
      envioUnidad,
      envioTorre,
      envioApto,
    } = req.body
    if (!productoId) return res.status(400).json({ error: 'productoId es requerido' })
    const cantidad = Math.max(1, Math.min(99, parseInt(cantidadRaw) || 1))
    const Producto = getProductoModel(req.db)
    const producto = await Producto.findById(productoId)
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' })
    if (producto.estado !== 'activo') return res.status(400).json({ error: 'Producto no disponible' })
    if (producto.tipo === 'producto' && producto.stock < cantidad) {
      return res.status(400).json({ error: `Solo hay ${producto.stock} unidades disponibles` })
    }
    const FRONT_URL = process.env.FRONT_URL
    const preference = new Preference(client)
    const result = await preference.create({
      body: {
        items: [
          {
            id:          producto._id.toString(),
            title:       producto.nombre,
            description: producto.descripcion || producto.nombre,
            quantity:    cantidad,
            unit_price:  Number(producto.precio),
            currency_id: 'COP',
          },
        ],
        back_urls: {
          success: `${FRONT_URL}/pago/exitoso${producto.whatsapp ? `?wa=${encodeURIComponent(producto.whatsapp)}` : ''}`,
          failure: `${FRONT_URL}/pago/fallido`,
          pending: `${FRONT_URL}/pago/pendiente`,
        },
        ...(FRONT_URL.startsWith('https') && { auto_return: 'approved' }),
        statement_descriptor: 'Miracle Solutions',
        metadata: {
          productoId:     producto._id.toString(),
          tenantSlug:     req.tenantSlug,
          cantidad,
          clienteNombre:  clienteNombre  || '',
          clienteCelular: clienteCelular || '',
          clienteEmail:   clienteEmail   || '',
          clienteCedula:  clienteCedula  || '',
          envioDireccion: envioDireccion || '',
          envioBarrio:    envioBarrio    || '',
          envioUnidad:    envioUnidad    || '',
          envioTorre:     envioTorre     || '',
          envioApto:      envioApto      || '',
        },
      },
    })
    res.json({ init_point: result.init_point })
  } catch (err) {
    console.error('[MP] Error al crear preferencia:', err)
    res.status(500).json({ error: 'Error al crear la preferencia de pago' })
  }
}

export async function recibirWebhook(req, res) {
  try {
    const { type, data } = req.body
    if (type !== 'payment' || !data?.id) {
      return res.sendStatus(200)
    }
    const paymentId = Number(data.id)
    const paymentApi = new Payment(client)
    const pago = await paymentApi.get({ id: paymentId })
    console.log(`[MP] Webhook recibido — PaymentID: ${paymentId}, Status: ${pago.status}`)
    if (pago.status !== 'approved') return res.sendStatus(200)

    const productoId = pago.metadata?.producto_id || pago.metadata?.productoId
    const cantidad   = Math.max(1, Number(pago.metadata?.cantidad) || 1)
    if (!productoId) {
      console.error('[MP] No se encontró productoId en metadata del pago:', paymentId)
      return res.sendStatus(200)
    }

    const Producto = getProductoModel(req.db)
    const Orden    = getOrdenModel(req.db)
    const Ticket   = getTicketModel(req.db)
    const Cliente  = getClienteModel(req.db)

    const producto = await Producto.findById(productoId)
    if (!producto) {
      console.error('[MP] Producto no encontrado:', productoId)
      return res.sendStatus(200)
    }

    const ordenExistente = pago.preference_id
      ? await Orden.findOne({ preferenceId: pago.preference_id })
      : null

    if (ordenExistente) {
      await Orden.findByIdAndUpdate(ordenExistente._id, {
        estadoPago: 'pagado', estadoPreparacion: 'no_preparado', estado: 'procesando', pagoId: String(paymentId),
      })
      await Ticket.create({
        numeroTicket: `TK-${ordenExistente.ordenNumero}-PAGO`,
        ordenId:      ordenExistente._id,
        tipo:         'pago_recibido',
        descripcion: [
          `Pago aprobado vía MercadoPago (WhatsApp).`,
          `Cliente: ${ordenExistente.cliente.nombre}`,
          `Producto: ${ordenExistente.productos[0]?.productoNombre}`,
          `Monto: $${Number(pago.transaction_amount).toLocaleString('es-CO')}`,
          `ID de pago MP: ${paymentId}`,
        ].join(' | '),
        creador: 'sistema-mercadopago',
      })
      if (producto.tipo === 'producto') {
        await Producto.findOneAndUpdate(
          { _id: productoId, tipo: 'producto', stock: { $gte: cantidad } },
          { $inc: { stock: -cantidad } }
        )
      }
    } else {
      const payerFirst = (pago.payer?.first_name || pago.additional_info?.payer?.first_name || '').trim()
      const payerLast  = (pago.payer?.last_name  || pago.additional_info?.payer?.last_name  || '').trim()
      const payerEmail = (pago.payer?.email || '').trim()
      const m = pago.metadata || {}
      const clienteNombre  = (m.cliente_nombre  || m.clienteNombre  || [payerFirst, payerLast].filter(Boolean).join(' ') || payerEmail.split('@')[0]).trim()
      // Solo se usa el celular del formulario (metadata). NO se usa payer.phone.number porque
      // MercadoPago puede retornar la cédula del perfil MP del comprador en ese campo.
      const clienteCelular = (m.cliente_celular || m.clienteCelular || '').trim()
      const emailComprador = (m.cliente_email   || m.clienteEmail   || payerEmail || 'desconocido@nointent.com').trim()
      const clienteCedula  = (m.cliente_cedula  || m.clienteCedula  || '').trim()
      const envioDireccion = (m.envio_direccion || m.envioDireccion || '').trim()
      const envioBarrio    = (m.envio_barrio    || m.envioBarrio    || '').trim()
      const envioUnidad    = (m.envio_unidad    || m.envioUnidad    || '').trim()
      const envioTorre     = (m.envio_torre     || m.envioTorre     || '').trim()
      const envioApto      = (m.envio_apto      || m.envioApto      || '').trim()

      const cliente = await Cliente.findOneAndUpdate(
        { email: emailComprador },
        {
          $set: {
            nombreEmpresa: clienteNombre, whatsapp: clienteCelular,
            ...(clienteCedula  && { cedulaNit: clienteCedula }),
            ...(envioDireccion && { direccion: envioDireccion }),
            ...(envioBarrio    && { ciudadBarrio: envioBarrio }),
            estado: 'activo',
          },
          $setOnInsert: { email: emailComprador },
        },
        { upsert: true, new: true }
      )

      const ordenNumero = await generarNumeroOrden(req.db)
      const nuevaOrden = await Orden.create({
        ordenNumero,
        clienteId: cliente._id,
        cliente:   { nombre: clienteNombre, email: emailComprador, whatsapp: clienteCelular, cedula: clienteCedula },
        envio:     { direccion: envioDireccion, barrio: envioBarrio, unidadResidencial: envioUnidad, torre: envioTorre, apto: envioApto },
        productos: [{
          productoId:     producto._id,
          productoNombre: producto.nombre,
          cantidad,
          precioUnitario: Number(pago.transaction_amount ?? 0) / cantidad,
          precioTotal:    Number(pago.transaction_amount ?? 0),
        }],
        totalMonto:        Number(pago.transaction_amount ?? 0),
        estado:            'procesando',
        estadoPago:        'pagado',
        estadoPreparacion: 'no_preparado',
        origen:            'web',
        metodoPago:        'mercadopago',
        pagoId:            String(paymentId),
        preferenceId:      pago.preference_id || '',
      })

      await Ticket.create({
        numeroTicket: `TK-${ordenNumero}`,
        ordenId:      nuevaOrden._id,
        tipo:         'pago_recibido',
        descripcion: [
          `Pago aprobado vía MercadoPago.`,
          `Cliente: ${clienteNombre} (${emailComprador})`,
          `Producto: ${producto.nombre}${cantidad > 1 ? ` x${cantidad}` : ''}`,
          `Monto: $${Number(pago.transaction_amount).toLocaleString('es-CO')}`,
          `ID de pago MP: ${paymentId}`,
        ].join(' | '),
        creador: 'sistema-mercadopago',
      })

      if (producto.tipo === 'producto') {
        await Producto.findOneAndUpdate(
          { _id: productoId, tipo: 'producto', stock: { $gte: cantidad } },
          { $inc: { stock: -cantidad } }
        )
      }
    }
  } catch (err) {
    console.error('[MP] Error procesando webhook:', err.message, err.stack)
  }
  res.sendStatus(200)
}
