import { getOrdenModel } from '../models/orden.model.js'
import { getTicketModel } from '../models/ticket.model.js'
import { getClienteModel } from '../models/cliente.model.js'
import { getProductoModel } from '../models/producto.model.js'
import { generarNumeroOrden } from '../utils/ordenUtils.js'
import { crearYEmitir } from '../controllers/notification.controller.js'

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
