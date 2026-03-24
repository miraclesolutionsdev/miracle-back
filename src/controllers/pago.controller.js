import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'
import Producto from '../models/producto.model.js'

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
})

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
        metadata: {
          productoId: producto._id.toString(),
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
    console.log('[MP] Webhook recibido:', JSON.stringify(req.body))

    if (type !== 'payment' || !data?.id) {
      console.log('[MP] Webhook ignorado — type:', type, 'data.id:', data?.id)
      return res.sendStatus(200)
    }

    const paymentId = Number(data.id)
    console.log('[MP] Consultando pago ID:', paymentId)

    const paymentApi = new Payment(client)
    const pago = await paymentApi.get({ id: paymentId })
    console.log('[MP] Estado del pago:', pago.status, '| metadata:', JSON.stringify(pago.metadata))

    if (pago.status === 'approved') {
      const productoId = pago.metadata?.producto_id || pago.metadata?.productoId
      if (!productoId) {
        console.log('[MP] No se encontró productoId en metadata')
      } else {
        const producto = await Producto.findById(productoId)
        if (!producto) {
          console.log('[MP] Producto no encontrado:', productoId)
        } else if (producto.stock <= 0) {
          console.log('[MP] Sin stock para producto:', productoId)
        } else {
          await Producto.findByIdAndUpdate(productoId, { $inc: { stock: -1 } })
          console.log(`[MP] Stock decrementado — producto ${productoId}, stock anterior: ${producto.stock}`)
        }
      }
    } else {
      console.log('[MP] Pago no aprobado, ignorando. Status:', pago.status)
    }
  } catch (err) {
    console.error('[MP] Error en webhook:', err.message)
  }

  res.sendStatus(200)
}
