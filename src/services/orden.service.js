import { getOrdenModel } from '../models/orden.model.js'
import { getTicketModel } from '../models/ticket.model.js'
import { getClienteModel } from '../models/cliente.model.js'
import { getProductoModel } from '../models/producto.model.js'
import { generarNumeroOrden } from '../utils/ordenUtils.js'
import { crearYEmitir } from './notification.service.js'

/**
 * Crea una orden pendiente de pago en la base de datos.
 * Usada por Web y WhatsApp antes de generar el link de MercadoPago.
 *
 * @returns {Promise<{orden, ordenNumero}>}
 */
export async function crearOrdenPendiente(db, {
  tenantSlug,
  origen, // 'web' | 'whatsapp'
  cliente: { nombre, email = '', whatsapp = '', cedula = '' },
  envio: { direccion = '', barrio = '', unidad = '', torre = '', apto = '' },
  productos, // [{ productoId, cantidad, precioUnitario, productoNombre, precioTotal }]
  totalMonto,
}) {
  // 1. Generar número de orden único
  const ordenNumero = await generarNumeroOrden(db)

  // 2. Crear o actualizar cliente en DB
  const Cliente = getClienteModel(db)
  const clienteKey = email ? { email } : { whatsapp }

  const cliente = await Cliente.findOneAndUpdate(
    clienteKey,
    {
      $set: {
        nombreEmpresa: nombre,
        ...(email && { email }),
        ...(whatsapp && { whatsapp }),
        ...(cedula && { cedulaNit: cedula }),
        ...(direccion && { direccion }),
        ...(barrio && { ciudadBarrio: barrio }),
        estado: 'activo',
      },
    },
    { upsert: true, new: true }
  )

  // 3. Crear orden en DB con estado pendiente
  const Orden = getOrdenModel(db)
  const orden = await Orden.create({
    ordenNumero,
    clienteId: cliente._id,
    cliente: { nombre, email, whatsapp, cedula },
    envio: {
      direccion,
      barrio,
      unidadResidencial: unidad,
      torre,
      apto,
    },
    productos,
    totalMonto,
    estado: 'pendiente',
    estadoPago: 'no_pagado',
    estadoPreparacion: 'no_preparado',
    origen,
    metodoPago: 'mercadopago',
    externalReference: ordenNumero, // ID único para linkear con webhook
  })

  // 4. Crear ticket de auditoría
  const Ticket = getTicketModel(db)
  const productosDesc = productos
    .map((p) => `${p.productoNombre}${p.cantidad > 1 ? ` x${p.cantidad}` : ''}`)
    .join(', ')

  await Ticket.create({
    numeroTicket: `TK-${ordenNumero}`,
    ordenId: orden._id,
    tipo: 'creacion',
    descripcion: [
      `Orden creada desde ${origen}.`,
      `Cliente: ${nombre}`,
      email && `Email: ${email}`,
      whatsapp && `Tel: ${whatsapp}`,
      `Productos: ${productosDesc}`,
      barrio && `Barrio/Ciudad: ${barrio}`,
      direccion && `Dirección: ${direccion}`,
    ]
      .filter(Boolean)
      .join(' | '),
    creador: origen === 'whatsapp' ? 'whatsapp-bot' : 'web-checkout',
  })

  console.log(`[Orden Service] ✓ Orden ${ordenNumero} creada | Origen: ${origen} | Cliente: ${nombre}`)

  return { orden, ordenNumero }
}

/**
 * Aprueba una orden cuando el pago es confirmado por MercadoPago.
 * Actualiza estados, decrementa stock, crea ticket y envía notificación.
 */
export async function aprobarOrden(db, tenantDbName, ordenId, paymentId, pago) {
  const Orden = getOrdenModel(db)
  const Ticket = getTicketModel(db)

  // 1. Actualizar orden a pagada
  await Orden.findByIdAndUpdate(ordenId, {
    estadoPago: 'pagado',
    estado: 'procesando',
    pagoId: String(paymentId),
    preferenceId: pago.preference_id || '',
  })

  const orden = await Orden.findById(ordenId)

  // 2. Crear ticket de pago recibido
  const productosDesc = orden.productos.map((p) => p.productoNombre).join(', ')
  await Ticket.create({
    numeroTicket: `TK-${orden.ordenNumero}-PAGO`,
    ordenId: orden._id,
    tipo: 'pago_recibido',
    descripcion: [
      `Pago aprobado vía MercadoPago.`,
      `Cliente: ${orden.cliente.nombre}`,
      `Productos: ${productosDesc}`,
      `Monto: $${Number(pago.transaction_amount).toLocaleString('es-CO')}`,
      `ID de pago MP: ${paymentId}`,
    ].join(' | '),
    creador: 'sistema-mercadopago',
  })

  // 3. Decrementar stock de productos físicos
  await decrementarStock(db, orden.productos)

  // 4. Enviar notificación al dashboard
  await crearYEmitir(db, tenantDbName, {
    tipo: 'pago_recibido',
    titulo: '💰 Pago recibido',
    mensaje: `Orden ${orden.ordenNumero} - ${orden.cliente.nombre} - $${Number(pago.transaction_amount).toLocaleString('es-CO')}`,
    meta: {
      ordenId: orden._id.toString(),
      ordenNumero: orden.ordenNumero,
      monto: Number(pago.transaction_amount),
    },
  })

  console.log(`[Orden Service] ✓ Orden ${orden.ordenNumero} aprobada | Pago: ${paymentId}`)

  return orden
}

/**
 * Decrementa el stock de productos físicos después de un pago aprobado.
 */
/**
 * Calcula ganancias, utilidad y detalle por producto de las órdenes completadas.
 * @param {object} db - Conexión a la DB del tenant
 * @param {{ desde?: string, hasta?: string }} filtroFechas
 * @returns {{ resumen, detalleProductos }}
 */
export async function calcularGanancias(db, { desde, hasta } = {}) {
  const Orden = getOrdenModel(db)
  const Producto = getProductoModel(db)

  const filtro = { estadoPago: 'pagado', estadoPreparacion: 'preparado' }
  if (desde || hasta) {
    filtro.createdAt = {}
    if (desde) filtro.createdAt.$gte = new Date(desde)
    if (hasta) {
      const fechaHasta = new Date(hasta)
      fechaHasta.setHours(23, 59, 59, 999)
      filtro.createdAt.$lte = fechaHasta
    }
  }

  const ordenes = await Orden.find(filtro).lean()

  let totalVendido = 0
  let totalUtilidad = 0
  let totalGananciaNeta = 0
  const detalleProductos = {}

  for (const orden of ordenes) {
    for (const item of orden.productos) {
      const producto = await Producto.findById(item.productoId).lean()
      const precioCliente = item.precioUnitario || 0
      const cantidad = item.cantidad || 1
      const subtotalVenta = precioCliente * cantidad

      totalVendido += subtotalVenta

      if (producto) {
        const utilidadPorcentaje = Number.isNaN(Number(producto.utilidad)) ? 30 : Number(producto.utilidad)
        const montoUtilidad = (precioCliente * utilidadPorcentaje) / 100
        const montoGananciaNeta = precioCliente - montoUtilidad

        totalUtilidad += montoUtilidad * cantidad
        totalGananciaNeta += montoGananciaNeta * cantidad

        const key = producto._id.toString()
        if (!detalleProductos[key]) {
          detalleProductos[key] = {
            productoId: key,
            nombre: producto.nombre,
            cantidadVendida: 0,
            totalVendido: 0,
            totalUtilidad: 0,
            totalGananciaNeta: 0,
            utilidadPorcentaje,
          }
        }
        detalleProductos[key].cantidadVendida += cantidad
        detalleProductos[key].totalVendido += subtotalVenta
        detalleProductos[key].totalUtilidad += montoUtilidad * cantidad
        detalleProductos[key].totalGananciaNeta += montoGananciaNeta * cantidad
      }
    }
  }

  return {
    resumen: {
      totalVendido: Math.round(totalVendido),
      totalUtilidad: Math.round(totalUtilidad),
      totalGananciaNeta: Math.round(totalGananciaNeta),
      cantidadOrdenes: ordenes.length,
    },
    detalleProductos: Object.values(detalleProductos),
  }
}

async function decrementarStock(db, productos) {
  const Producto = getProductoModel(db)

  await Promise.all(
    productos.map((item) =>
      Producto.findOneAndUpdate(
        { _id: item.productoId, tipo: 'producto', stock: { $gte: item.cantidad } },
        { $inc: { stock: -item.cantidad } }
      )
    )
  )
}
