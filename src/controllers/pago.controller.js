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
      productos: productosArray,
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

    const Producto = getProductoModel(req.db)
    const FRONT_URL = process.env.FRONT_URL
    let mpItems = []
    let productosMetadata = []
    let whatsappNumber = null

    // Detectar modo: single o multiple
    const isMultiple = !!productosArray

    if (isMultiple) {
      // Modo carrito: procesar array de productos
      if (!productosArray || productosArray.length === 0) {
        return res.status(400).json({ error: 'productos es requerido' })
      }

      for (const item of productosArray) {
        const { productoId: pid, cantidad: cant } = item
        if (!pid || !cant) {
          return res.status(400).json({ error: 'Cada producto debe tener productoId y cantidad' })
        }

        const cantidad = Math.max(1, Math.min(99, parseInt(cant) || 1))
        const producto = await Producto.findById(pid)

        if (!producto) {
          return res.status(404).json({ error: `Producto no encontrado: ${pid}` })
        }
        if (producto.estado !== 'activo') {
          return res.status(400).json({ error: `Producto "${producto.nombre}" no está disponible` })
        }
        if (producto.tipo === 'producto' && producto.stock < cantidad) {
          return res.status(400).json({
            error: `Stock insuficiente para "${producto.nombre}". Disponible: ${producto.stock}, solicitado: ${cantidad}`,
          })
        }

        mpItems.push({
          id: producto._id.toString(),
          title: producto.nombre,
          description: producto.descripcion || producto.nombre,
          quantity: cantidad,
          unit_price: Number(producto.precio),
          currency_id: 'COP',
        })

        productosMetadata.push({
          productoId: producto._id.toString(),
          cantidad,
          precioUnitario: Number(producto.precio),
        })

        // Guardar whatsapp del primer producto (para contacto post-pago)
        if (!whatsappNumber && producto.whatsapp) {
          whatsappNumber = producto.whatsapp
        }
      }
    } else {
      // Modo single: backward compatible
      if (!productoId) return res.status(400).json({ error: 'productoId es requerido' })

      const cantidad = Math.max(1, Math.min(99, parseInt(cantidadRaw) || 1))
      const producto = await Producto.findById(productoId)

      if (!producto) return res.status(404).json({ error: 'Producto no encontrado' })
      if (producto.estado !== 'activo') return res.status(400).json({ error: 'Producto no disponible' })
      if (producto.tipo === 'producto' && producto.stock < cantidad) {
        return res.status(400).json({ error: `Solo hay ${producto.stock} unidades disponibles` })
      }

      mpItems = [
        {
          id: producto._id.toString(),
          title: producto.nombre,
          description: producto.descripcion || producto.nombre,
          quantity: cantidad,
          unit_price: Number(producto.precio),
          currency_id: 'COP',
        },
      ]

      productosMetadata = [
        {
          productoId: producto._id.toString(),
          cantidad,
          precioUnitario: Number(producto.precio),
        },
      ]

      whatsappNumber = producto.whatsapp
    }

    // Crear preferencia en MercadoPago
    const preference = new Preference(client)
    const result = await preference.create({
      body: {
        items: mpItems,
        back_urls: {
          success: `${FRONT_URL}/pago/exitoso?slug=${req.tenantSlug}${whatsappNumber ? `&wa=${encodeURIComponent(whatsappNumber)}` : ''}`,
          failure: `${FRONT_URL}/pago/fallido?slug=${req.tenantSlug}`,
          pending: `${FRONT_URL}/pago/pendiente?slug=${req.tenantSlug}`,
        },
        ...(FRONT_URL.startsWith('https') && { auto_return: 'approved' }),
        statement_descriptor: 'Miracle Solutions',
        metadata: {
          tenantSlug: req.tenantSlug,
          productos: JSON.stringify(productosMetadata),
          clienteNombre: clienteNombre || '',
          clienteCelular: clienteCelular || '',
          clienteEmail: clienteEmail || '',
          clienteCedula: clienteCedula || '',
          envioDireccion: envioDireccion || '',
          envioBarrio: envioBarrio || '',
          envioUnidad: envioUnidad || '',
          envioTorre: envioTorre || '',
          envioApto: envioApto || '',
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

    // Reutilizar el pago si ya lo fetch el middleware (optimización)
    let pago = req.mercadoPagoPago
    if (!pago) {
      const paymentApi = new Payment(client)
      pago = await paymentApi.get({ id: paymentId })
    }

    console.log(`[MP] Webhook recibido — PaymentID: ${paymentId}, Status: ${pago.status}`)
    if (pago.status !== 'approved') return res.sendStatus(200)

    const m = pago.metadata || {}

    // Parsear productos: puede venir como JSON string o como formato legacy
    let productosData = []
    if (m.productos) {
      try {
        productosData = JSON.parse(m.productos)
      } catch {
        console.warn('[MP] Error parseando metadata.productos, usando formato legacy')
      }
    }

    // Fallback a formato legacy (single producto)
    if (productosData.length === 0) {
      const productoId = m.producto_id || m.productoId
      const cantidad = Math.max(1, Number(m.cantidad) || 1)
      if (!productoId) {
        console.error('[MP] No se encontró productoId ni productos en metadata del pago:', paymentId)
        return res.sendStatus(200)
      }
      productosData = [{ productoId, cantidad, precioUnitario: Number(pago.transaction_amount) / cantidad }]
    }

    const Producto = getProductoModel(req.db)
    const Orden    = getOrdenModel(req.db)
    const Ticket   = getTicketModel(req.db)
    const Cliente  = getClienteModel(req.db)

    // Verificar si ya existe una orden con este preference_id (caso WhatsApp)
    console.log('[MP] Buscando orden existente con preferenceId:', pago.preference_id)
    console.log('[MP] Tenant DB:', req.db ? req.db.name : 'NO DB')

    let ordenExistente = pago.preference_id
      ? await Orden.findOne({ preferenceId: pago.preference_id })
      : null

    // Si no se encontró, esperar 2 segundos y reintentar (por si el webhook llegó muy rápido)
    if (!ordenExistente && pago.preference_id) {
      console.log('[MP] Orden no encontrada, esperando 2s y reintentando...')
      await new Promise(resolve => setTimeout(resolve, 2000))
      ordenExistente = await Orden.findOne({ preferenceId: pago.preference_id })
    }

    console.log('[MP] Resultado de búsqueda:', ordenExistente ? `Orden ${ordenExistente.ordenNumero} encontrada` : 'No encontrada')

    if (ordenExistente) {
      console.log('[MP] Orden existente encontrada:', ordenExistente.ordenNumero, '- Actualizando a pagado')
      // Caso WhatsApp: orden ya existe, solo actualizar estado de pago
      await Orden.findByIdAndUpdate(ordenExistente._id, {
        estadoPago: 'pagado',
        estadoPreparacion: 'no_preparado',
        estado: 'procesando',
        pagoId: String(paymentId),
      })
      console.log('[MP] Orden actualizada exitosamente')

      const productosNombres = ordenExistente.productos.map((p) => p.productoNombre).join(', ')
      await Ticket.create({
        numeroTicket: `TK-${ordenExistente.ordenNumero}-PAGO`,
        ordenId: ordenExistente._id,
        tipo: 'pago_recibido',
        descripcion: [
          `Pago aprobado vía MercadoPago (WhatsApp).`,
          `Cliente: ${ordenExistente.cliente.nombre}`,
          `Productos: ${productosNombres}`,
          `Monto: $${Number(pago.transaction_amount).toLocaleString('es-CO')}`,
          `ID de pago MP: ${paymentId}`,
        ].join(' | '),
        creador: 'sistema-mercadopago',
      })

      // Decrementar stock de todos los productos
      for (const item of ordenExistente.productos) {
        const prod = await Producto.findById(item.productoId)
        if (prod && prod.tipo === 'producto') {
          console.log(`[MP] Decrementando stock de ${prod.nombre}: ${prod.stock} - ${item.cantidad}`)
          await Producto.findOneAndUpdate(
            { _id: item.productoId, tipo: 'producto', stock: { $gte: item.cantidad } },
            { $inc: { stock: -item.cantidad } }
          )
        }
      }
      console.log('[MP] Webhook procesado exitosamente (caso WhatsApp)')
      return res.sendStatus(200)
    } else {
      console.log('[MP] No se encontró orden existente, creando nueva orden (caso Web)')
      // Caso Web: crear nueva orden con uno o múltiples productos
      const payerFirst = (pago.payer?.first_name || pago.additional_info?.payer?.first_name || '').trim()
      const payerLast = (pago.payer?.last_name || pago.additional_info?.payer?.last_name || '').trim()
      const payerEmail = (pago.payer?.email || '').trim()

      const clienteNombre = (
        m.cliente_nombre ||
        m.clienteNombre ||
        [payerFirst, payerLast].filter(Boolean).join(' ') ||
        payerEmail.split('@')[0]
      ).trim()
      const clienteCelular = (m.cliente_celular || m.clienteCelular || '').trim()
      const emailComprador = (m.cliente_email || m.clienteEmail || payerEmail || 'desconocido@nointent.com').trim()
      const clienteCedula = (m.cliente_cedula || m.clienteCedula || '').trim()
      const envioDireccion = (m.envio_direccion || m.envioDireccion || '').trim()
      const envioBarrio = (m.envio_barrio || m.envioBarrio || '').trim()
      const envioUnidad = (m.envio_unidad || m.envioUnidad || '').trim()
      const envioTorre = (m.envio_torre || m.envioTorre || '').trim()
      const envioApto = (m.envio_apto || m.envioApto || '').trim()

      // Crear o actualizar cliente
      const cliente = await Cliente.findOneAndUpdate(
        { email: emailComprador },
        {
          $set: {
            nombreEmpresa: clienteNombre,
            whatsapp: clienteCelular,
            ...(clienteCedula && { cedulaNit: clienteCedula }),
            ...(envioDireccion && { direccion: envioDireccion }),
            ...(envioBarrio && { ciudadBarrio: envioBarrio }),
            estado: 'activo',
          },
          $setOnInsert: { email: emailComprador },
        },
        { upsert: true, new: true }
      )

      // Construir array de productos para la orden
      const productosOrden = []
      for (const item of productosData) {
        const prod = await Producto.findById(item.productoId)
        if (prod) {
          productosOrden.push({
            productoId: prod._id,
            productoNombre: prod.nombre,
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario,
            precioTotal: item.precioUnitario * item.cantidad,
          })
        }
      }

      if (productosOrden.length === 0) {
        console.error('[MP] No se pudieron cargar productos para crear la orden')
        return res.sendStatus(200)
      }

      // Crear orden
      const ordenNumero = await generarNumeroOrden(req.db)
      const nuevaOrden = await Orden.create({
        ordenNumero,
        clienteId: cliente._id,
        cliente: { nombre: clienteNombre, email: emailComprador, whatsapp: clienteCelular, cedula: clienteCedula },
        envio: {
          direccion: envioDireccion,
          barrio: envioBarrio,
          unidadResidencial: envioUnidad,
          torre: envioTorre,
          apto: envioApto,
        },
        productos: productosOrden,
        totalMonto: Number(pago.transaction_amount ?? 0),
        estado: 'procesando',
        estadoPago: 'pagado',
        estadoPreparacion: 'no_preparado',
        origen: 'web',
        metodoPago: 'mercadopago',
        pagoId: String(paymentId),
        preferenceId: pago.preference_id || '',
      })

      // Crear ticket
      const productosNombres = productosOrden.map((p) => `${p.productoNombre} x${p.cantidad}`).join(', ')
      await Ticket.create({
        numeroTicket: `TK-${ordenNumero}`,
        ordenId: nuevaOrden._id,
        tipo: 'pago_recibido',
        descripcion: [
          `Pago aprobado vía MercadoPago.`,
          `Cliente: ${clienteNombre} (${emailComprador})`,
          `Productos: ${productosNombres}`,
          `Monto: $${Number(pago.transaction_amount).toLocaleString('es-CO')}`,
          `ID de pago MP: ${paymentId}`,
        ].join(' | '),
        creador: 'sistema-mercadopago',
      })

      // Decrementar stock de todos los productos
      for (const item of productosOrden) {
        const prod = await Producto.findById(item.productoId)
        if (prod && prod.tipo === 'producto') {
          await Producto.findOneAndUpdate(
            { _id: item.productoId, tipo: 'producto', stock: { $gte: item.cantidad } },
            { $inc: { stock: -item.cantidad } }
          )
        }
      }
    }
  } catch (err) {
    console.error('[MP] Error procesando webhook:', err.message, err.stack)
  }
  res.sendStatus(200)
}
