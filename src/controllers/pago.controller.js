import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'
import { getProductoModel } from '../models/producto.model.js'
import { getOrdenModel } from '../models/orden.model.js'
import { crearOrdenPendiente, aprobarOrden } from '../services/orden.service.js'

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
})

/**
 * Crea una preferencia de pago en MercadoPago (Web).
 * Primero crea la orden en DB con estado pendiente, luego genera el link de pago.
 */
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
    const FRONT_URL = req.tenantDominio
      ? `https://${req.tenantDominio}`
      : process.env.FRONT_URL
    const isMultiple = !!productosArray

    // Validar y procesar productos
    const productosEncontrados = []
    let totalMonto = 0
    let whatsappNumber = null

    if (isMultiple) {
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

        const precioUnitario = Number(producto.precio)
        const precioTotal = precioUnitario * cantidad
        totalMonto += precioTotal

        productosEncontrados.push({
          productoId: producto._id,
          productoNombre: producto.nombre,
          cantidad,
          precioUnitario,
          precioTotal,
        })

        if (!whatsappNumber && producto.whatsapp) {
          whatsappNumber = producto.whatsapp
        }
      }
    } else {
      if (!productoId) return res.status(400).json({ error: 'productoId es requerido' })

      const cantidad = Math.max(1, Math.min(99, parseInt(cantidadRaw) || 1))
      const producto = await Producto.findById(productoId)

      if (!producto) return res.status(404).json({ error: 'Producto no encontrado' })
      if (producto.estado !== 'activo') return res.status(400).json({ error: 'Producto no disponible' })
      if (producto.tipo === 'producto' && producto.stock < cantidad) {
        return res.status(400).json({ error: `Solo hay ${producto.stock} unidades disponibles` })
      }

      const precioUnitario = Number(producto.precio)
      const precioTotal = precioUnitario * cantidad
      totalMonto = precioTotal

      productosEncontrados.push({
        productoId: producto._id,
        productoNombre: producto.nombre,
        cantidad,
        precioUnitario,
        precioTotal,
      })

      whatsappNumber = producto.whatsapp
    }

    // Crear orden pendiente en DB
    const { ordenNumero } = await crearOrdenPendiente(req.db, {
      tenantSlug: req.tenantSlug,
      origen: 'web',
      cliente: {
        nombre: clienteNombre || 'Cliente Web',
        email: clienteEmail,
        whatsapp: clienteCelular,
        cedula: clienteCedula,
      },
      envio: {
        direccion: envioDireccion,
        barrio: envioBarrio,
        unidad: envioUnidad,
        torre: envioTorre,
        apto: envioApto,
      },
      productos: productosEncontrados,
      totalMonto,
    })

    // Crear items para MercadoPago
    const mpItems = productosEncontrados.map((p) => ({
      id: p.productoId.toString(),
      title: p.productoNombre,
      description: p.productoNombre,
      quantity: p.cantidad,
      unit_price: p.precioUnitario,
      currency_id: 'COP',
    }))

    // Crear preference en MercadoPago
    const preference = new Preference(client)
    const result = await preference.create({
      body: {
        items: mpItems,
        external_reference: ordenNumero,
        back_urls: {
          success: `${FRONT_URL}/pago/exitoso?slug=${req.tenantSlug}${whatsappNumber ? `&wa=${encodeURIComponent(whatsappNumber)}` : ''}`,
          failure: `${FRONT_URL}/pago/fallido?slug=${req.tenantSlug}`,
          pending: `${FRONT_URL}/pago/pendiente?slug=${req.tenantSlug}`,
        },
        ...(FRONT_URL.startsWith('https') && { auto_return: 'approved' }),
        statement_descriptor: (req.tenantNombre || 'Miracle Solutions').slice(0, 22),
        metadata: {
          tenantSlug: req.tenantSlug,
          ordenNumero,
          origen: 'web',
        },
      },
    })

    console.log(`[MP Web] ✓ Orden ${ordenNumero} creada | Link: ${result.init_point}`)

    res.json({ init_point: result.init_point, ordenNumero })
  } catch (err) {
    console.error('[MP] Error al crear preferencia:', err)
    res.status(500).json({ error: 'Error al crear la preferencia de pago' })
  }
}

/**
 * Recibe webhooks de MercadoPago cuando un pago es aprobado.
 * Busca la orden pendiente por external_reference y la aprueba.
 */
export async function recibirWebhook(req, res) {
  try {
    const { type, data } = req.body
    if (type !== 'payment' || !data?.id) {
      return res.sendStatus(200)
    }

    const paymentId = Number(data.id)

    // Reutilizar el pago si ya lo fetch el middleware
    let pago = req.mercadoPagoPago
    if (!pago) {
      const paymentApi = new Payment(client)
      pago = await paymentApi.get({ id: paymentId })
    }

    console.log(`[MP Webhook] Payment ${paymentId} | Status: ${pago.status} | ExtRef: ${pago.external_reference}`)

    if (pago.status !== 'approved') {
      return res.sendStatus(200)
    }

    // Buscar orden por external_reference
    const Orden = getOrdenModel(req.db)

    if (!pago.external_reference) {
      console.error('[MP Webhook] ⚠️  Pago sin external_reference - No se puede linkear con orden')
      return res.sendStatus(200)
    }

    let orden = await Orden.findOne({ externalReference: pago.external_reference })

    // Retry una vez si no se encuentra (por si el webhook llegó muy rápido)
    if (!orden) {
      console.log('[MP Webhook] Orden no encontrada, reintentando en 2s...')
      await new Promise((resolve) => setTimeout(resolve, 2000))
      orden = await Orden.findOne({ externalReference: pago.external_reference })
    }

    if (!orden) {
      console.error('[MP Webhook] ⚠️  No se encontró orden con externalReference:', pago.external_reference)
      return res.sendStatus(200)
    }

    // Verificar que no esté ya pagada (evitar procesamiento duplicado)
    if (orden.estadoPago === 'pagado') {
      console.log('[MP Webhook] ✓ Orden ya procesada anteriormente:', orden.ordenNumero)
      return res.sendStatus(200)
    }

    // Aprobar orden
    await aprobarOrden(req.db, req.tenantDbName, orden._id, paymentId, pago)

    console.log('[MP Webhook] ✓ Pago procesado exitosamente')
    return res.sendStatus(200)
  } catch (err) {
    console.error('[MP Webhook] Error:', err.message)
    return res.status(500).json({ error: 'Error procesando webhook' })
  }
}
