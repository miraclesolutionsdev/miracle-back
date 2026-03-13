import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'
import Producto from '../models/producto.model.js'

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
})

export async function crearPreferencia(req, res) {
  try {
    const { productoId, nombre, telefono } = req.body

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

    const FRONT_URL = process.env.FRONT_URL || 'https://miracle-front-jade.vercel.app'

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
        payer: {
          name: nombre || '',
          phone: telefono ? { number: telefono } : undefined,
        },
        back_urls: {
          success: `${FRONT_URL}/pago/exitoso`,
          failure: `${FRONT_URL}/pago/fallido`,
          pending: `${FRONT_URL}/pago/pendiente`,
        },
        auto_return: 'approved',
        statement_descriptor: 'Miracle Solutions',
        metadata: {
          producto_id: producto._id.toString(),
          producto_nombre: producto.nombre,
          comprador_nombre: nombre || '',
          comprador_telefono: telefono || '',
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
  // Mercado Pago espera un 200 rápido para no reintentar
  res.sendStatus(200)

  try {
    const { type, data } = req.body

    if (type !== 'payment' || !data?.id) return

    const paymentApi = new Payment(client)
    const pago = await paymentApi.get({ id: data.id })

    if (pago.status !== 'approved') return

    const productoId = pago.metadata?.producto_id
    if (!productoId) return

    const producto = await Producto.findById(productoId)
    if (!producto || producto.stock <= 0) return

    await Producto.findByIdAndUpdate(productoId, { $inc: { stock: -1 } })
    console.log(`[MP] Stock decrementado para producto ${productoId}`)
  } catch (err) {
    console.error('[MP] Error al procesar webhook:', err)
  }
}
