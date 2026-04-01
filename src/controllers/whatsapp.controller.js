import { MercadoPagoConfig, Preference } from 'mercadopago'
import Producto from '../models/producto.model.js'
import Orden from '../models/orden.model.js'
import Ticket from '../models/ticket.model.js'
import Cliente from '../models/cliente.model.js'
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
      nombre,
      telefono,
      ciudad      = '',
      ciudadBarrio = '',
      direccion   = '',
      producto: productoNombre,
      talla       = '',
      color       = '',
      cantidad: cantidadRaw = 1,
    } = req.body

    if (!nombre || !telefono || !productoNombre) {
      return res.status(400).json({
        error: 'Faltan datos requeridos: nombre, telefono, producto',
      })
    }

    const cantidad = Math.max(1, Math.min(99, parseInt(cantidadRaw) || 1))

    // Buscar producto activo por nombre (búsqueda flexible, case-insensitive)
    const producto = await Producto.findOne({
      nombre: { $regex: productoNombre.trim(), $options: 'i' },
      estado: 'activo',
    })

    if (!producto) {
      return res.status(404).json({
        error: `No se encontró el producto "${productoNombre}" en el catálogo activo.`,
      })
    }

    // Construir nombre del item con variante
    const itemTitle = [
      producto.nombre,
      talla && `Talla ${talla}`,
      color,
    ].filter(Boolean).join(' - ')

    // Crear preferencia de pago en MercadoPago
    // Acepta ciudad o ciudadBarrio (ElevenLabs envía ciudadBarrio)
    const ciudadFinal = ciudadBarrio || ciudad

    const FRONT_URL = process.env.FRONT_URL || 'https://www.miraclesolutions.com.co'
    const preference = new Preference(client)
    const mpResult = await preference.create({
      body: {
        items: [
          {
            id:          producto._id.toString(),
            title:       itemTitle,
            description: itemTitle,
            quantity:    cantidad,
            unit_price:  Number(producto.precio),
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
          origen:        'whatsapp',
          productoId:    producto._id.toString(),
          cantidad,
          clienteNombre: nombre,
          clienteCelular: telefono,
          talla,
          color,
          envioDireccion: direccion,
          envioBarrio:    ciudadFinal,
        },
      },
    })

    const preferenceId = mpResult.id
    const linkPago     = mpResult.init_point

    // Upsert cliente por teléfono
    const cliente = await Cliente.findOneAndUpdate(
      { whatsapp: telefono },
      {
        $set: {
          nombreEmpresa: nombre,
          whatsapp:      telefono,
          ...(ciudadFinal && { ciudadBarrio: ciudadFinal }),
          ...(direccion  && { direccion }),
          estado: 'activo',
        },
        $setOnInsert: { email: '' },
      },
      { upsert: true, new: true }
    )

    // Generar número de orden
    const ordenNumero = await generarNumeroOrden()

    // Crear orden con estado: no pagado / no preparado / origen whatsapp
    const nuevaOrden = await Orden.create({
      ordenNumero,
      clienteId: cliente._id,
      cliente: {
        nombre,
        email:    '',
        whatsapp: telefono,
        cedula:   '',
      },
      envio: {
        direccion,
        barrio: ciudadFinal,
      },
      productos: [
        {
          productoId:     producto._id,
          productoNombre: producto.nombre,
          cantidad,
          precioUnitario: Number(producto.precio),
          precioTotal:    Number(producto.precio) * cantidad,
        },
      ],
      totalMonto:        Number(producto.precio) * cantidad,
      estado:            'pendiente',
      estadoPago:        'no_pagado',
      estadoPreparacion: 'no_preparado',
      origen:            'whatsapp',
      metodoPago:        'mercadopago',
      preferenceId,
      talla,
      color,
    })

    // Crear ticket de creación
    await Ticket.create({
      numeroTicket: `TK-${ordenNumero}`,
      ordenId:      nuevaOrden._id,
      tipo:         'creacion',
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

    return res.json({
      ok:           true,
      orden_numero: ordenNumero,
      link_pago:    linkPago,
      mensaje:      `Orden #${ordenNumero} registrada. Link de pago: ${linkPago}`,
    })
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
  const agentId = (process.env.ELEVENLABS_AGENT_ID || '').trim()
  const apiKey  = (process.env.ELEVENLABS_API_KEY  || '').trim()

  if (!agentId || !apiKey) {
    return res.status(503).json({ error: 'Faltan ELEVENLABS_API_KEY o ELEVENLABS_AGENT_ID en las variables de entorno.' })
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
