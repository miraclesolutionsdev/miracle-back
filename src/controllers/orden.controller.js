import { getOrdenModel } from '../models/orden.model.js'
import { getTicketModel } from '../models/ticket.model.js'
import { getProductoModel } from '../models/producto.model.js'
import { getClienteModel } from '../models/cliente.model.js'
import {
  generarNumeroOrden,
  esTransicionValida,
  calcularTotalesOrden,
} from '../utils/ordenUtils.js'
import { crearYEmitir } from './notification.controller.js'

export async function listarOrdenes(req, res) {
  try {
    const { estado, estadoPago, estadoPreparacion, origen, desde, hasta, email, ordenNumero, limit = 10, skip = 0 } = req.query
    const Orden = getOrdenModel(req.db)
    const Ticket = getTicketModel(req.db)
    const filtro = {}
    if (estado)            filtro.estado            = estado
    if (estadoPago)        filtro.estadoPago        = estadoPago
    if (estadoPreparacion) filtro.estadoPreparacion = estadoPreparacion
    if (origen)            filtro.origen            = origen
    if (email) filtro['cliente.email'] = String(email).trim().toLowerCase()
    if (ordenNumero) {
      const escaped = String(ordenNumero).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      filtro.ordenNumero = { $regex: escaped, $options: 'i' }
    }
    if (desde || hasta) {
      filtro.createdAt = {}
      if (desde) filtro.createdAt.$gte = new Date(desde)
      if (hasta) {
        const fechaHasta = new Date(hasta)
        fechaHasta.setHours(23, 59, 59, 999)
        filtro.createdAt.$lte = fechaHasta
      }
    }
    const ordenes = await Orden.find(filtro)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit), 100))
      .skip(Number(skip))
      .lean()
    const total = await Orden.countDocuments(filtro)
    const ordenesEnriquecidas = await Promise.all(
      ordenes.map(async (orden) => {
        const ultimoTicket = await Ticket.findOne({ ordenId: orden._id })
          .sort({ createdAt: -1 })
          .lean()
        return { ...orden, ultimoTicket: ultimoTicket || null }
      })
    )
    res.json({ ordenes: ordenesEnriquecidas, total, limit: Number(limit), skip: Number(skip) })
  } catch (err) {
    console.error('[Ordenes] Error listando:', err.message)
    res.status(500).json({ error: 'Error al obtener órdenes' })
  }
}

export async function obtenerOrden(req, res) {
  try {
    const { id } = req.params
    const Orden = getOrdenModel(req.db)
    const Ticket = getTicketModel(req.db)
    const Producto = getProductoModel(req.db)
    const orden = await Orden.findById(id).lean()
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' })
    const tickets = await Ticket.find({ ordenId: id }).sort({ createdAt: -1 }).lean()
    const productosEnriquecidos = await Promise.all(
      orden.productos.map(async (prod) => {
        const producto = await Producto.findById(prod.productoId)
          .select('nombre descripcion precio stock')
          .lean()
        return { ...prod, stock: producto?.stock || 0, descripcion: producto?.descripcion || '' }
      })
    )
    res.json({ orden: { ...orden, productos: productosEnriquecidos }, tickets })
  } catch (err) {
    console.error('[Ordenes] Error obteniendo:', err.message)
    res.status(500).json({ error: 'Error al obtener orden' })
  }
}

export async function crearOrden(req, res) {
  try {
    const { clienteId, productos: productosInput, notas } = req.body
    const Orden = getOrdenModel(req.db)
    const Ticket = getTicketModel(req.db)
    const Producto = getProductoModel(req.db)
    const Cliente = getClienteModel(req.db)
    if (!clienteId) return res.status(400).json({ error: 'clienteId es requerido' })
    const cliente = await Cliente.findById(clienteId)
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' })
    if (!Array.isArray(productosInput) || productosInput.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos un producto' })
    }
    const productos = []
    for (const { productoId, cantidad } of productosInput) {
      if (!productoId || !cantidad || cantidad < 1) {
        return res.status(400).json({ error: 'Producto inválido o cantidad < 1' })
      }
      const producto = await Producto.findById(productoId)
      if (!producto) return res.status(404).json({ error: `Producto no encontrado: ${productoId}` })
      if (producto.stock < cantidad) {
        return res.status(400).json({
          error: `Stock insuficiente para ${producto.nombre}. Disponible: ${producto.stock}`,
        })
      }
      productos.push({
        productoId: producto._id,
        productoNombre: producto.nombre,
        cantidad,
        precioUnitario: Number(producto.precio),
        precioTotal: Number(producto.precio) * cantidad,
      })
    }
    const { total } = calcularTotalesOrden(productos)
    const ordenNumero = await generarNumeroOrden(req.db)
    const nuevaOrden = await Orden.create({
      ordenNumero,
      clienteId,
      cliente: {
        nombre: cliente.nombreEmpresa || 'Sin nombre',
        email: cliente.email || '',
        whatsapp: cliente.whatsapp || '',
      },
      productos,
      totalMonto: total,
      estado: 'pendiente',
      metodoPago: 'manual',
      notas: notas || '',
    })
    const resultados = []
    for (const prod of productos) {
      const updated = await Producto.findOneAndUpdate(
        { _id: prod.productoId, stock: { $gte: prod.cantidad } },
        { $inc: { stock: -prod.cantidad } }
      )
      resultados.push({ prod, ok: !!updated })
    }
    if (resultados.some((r) => !r.ok)) {
      for (const { prod, ok } of resultados) {
        if (ok) await Producto.findByIdAndUpdate(prod.productoId, { $inc: { stock: prod.cantidad } })
      }
      await Orden.findByIdAndDelete(nuevaOrden._id)
      return res.status(409).json({ error: 'Stock insuficiente. Intenta de nuevo.' })
    }
    const ticket = await Ticket.create({
      numeroTicket: `TK-${ordenNumero}`,
      ordenId: nuevaOrden._id,
      tipo: 'creacion',
      descripcion: `Orden creada manualmente con ${productos.length} producto(s)`,
      creador: 'manual',
    })
    crearYEmitir(req.db, req.tenantDbName, {
      tipo: 'orden_creada',
      titulo: 'Nueva orden de venta',
      mensaje: `Orden ${nuevaOrden.ordenNumero} de ${nuevaOrden.cliente.nombre} · $${total.toLocaleString('es-CO')}`,
      meta: { id: nuevaOrden._id.toString(), ordenNumero: nuevaOrden.ordenNumero, total, cliente: nuevaOrden.cliente.nombre },
    })
    res.status(201).json({ orden: nuevaOrden.toObject(), ticket })
  } catch (err) {
    console.error('[Ordenes] Error creando:', err.message)
    res.status(500).json({ error: 'Error al crear orden' })
  }
}

export async function actualizarEstadoOrden(req, res) {
  try {
    const { id } = req.params
    const { nuevoEstado, notas } = req.body
    if (!nuevoEstado) return res.status(400).json({ error: 'nuevoEstado es requerido' })
    const Orden = getOrdenModel(req.db)
    const Ticket = getTicketModel(req.db)
    const Producto = getProductoModel(req.db)
    const orden = await Orden.findById(id)
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' })
    if (!esTransicionValida(orden.estado, nuevoEstado)) {
      return res.status(400).json({ error: `Transición inválida: ${orden.estado} → ${nuevoEstado}` })
    }
    const estadoAnterior = orden.estado
    if (nuevoEstado === 'cancelada') {
      for (const prod of orden.productos) {
        await Producto.findByIdAndUpdate(prod.productoId, { $inc: { stock: prod.cantidad } })
      }
    }
    orden.estado = nuevoEstado
    await orden.save()
    const ticket = await Ticket.create({
      numeroTicket: `TK-${orden.ordenNumero}-${Date.now()}`,
      ordenId: orden._id,
      tipo: nuevoEstado === 'cancelada' ? 'cancelacion' : 'actualización',
      descripcion: notas || `Estado actualizado a: ${nuevoEstado}`,
      cambios: { campo: 'estado', valorAnterior: estadoAnterior, valorNuevo: nuevoEstado },
      creador: 'sistema',
    })
    const estadoLabel = { procesando: 'en proceso', enviada: 'enviada', entregada: 'entregada', cancelada: 'cancelada' }
    crearYEmitir(req.db, req.tenantDbName, {
      tipo: 'orden_estado',
      titulo: 'Estado de orden actualizado',
      mensaje: `Orden ${orden.ordenNumero} marcada como ${estadoLabel[nuevoEstado] || nuevoEstado}`,
      meta: { id: id, ordenNumero: orden.ordenNumero, estado: nuevoEstado },
    })
    res.json({ orden: orden.toObject(), ticket })
  } catch (err) {
    console.error('[Ordenes] Error actualizando estado:', err.message)
    res.status(500).json({ error: 'Error al actualizar estado' })
  }
}

export async function crearTicketManual(req, res) {
  try {
    const { id } = req.params
    const { tipo, descripcion, cambios } = req.body
    if (!tipo || !descripcion) {
      return res.status(400).json({ error: 'tipo y descripcion son requeridos' })
    }
    const Orden = getOrdenModel(req.db)
    const Ticket = getTicketModel(req.db)
    const orden = await Orden.findById(id)
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' })
    const ticket = await Ticket.create({
      numeroTicket: `TK-${orden.ordenNumero}-${Date.now()}`,
      ordenId: orden._id,
      tipo,
      descripcion,
      cambios,
      creador: 'manual',
    })
    crearYEmitir(req.db, req.tenantDbName, {
      tipo: 'ticket_creado',
      titulo: 'Nuevo ticket en orden',
      mensaje: `${ticket.numeroTicket}: ${descripcion.length > 70 ? descripcion.slice(0, 70) + '…' : descripcion}`,
      meta: { id: id, ordenNumero: orden.ordenNumero, ticket: ticket.numeroTicket },
    })
    res.status(201).json(ticket)
  } catch (err) {
    console.error('[Ordenes] Error creando ticket:', err.message)
    res.status(500).json({ error: 'Error al crear ticket' })
  }
}

export async function actualizarPreparacion(req, res) {
  try {
    const { id } = req.params
    const { estadoPreparacion } = req.body
    if (!['preparado', 'no_preparado'].includes(estadoPreparacion)) {
      return res.status(400).json({ error: 'estadoPreparacion debe ser "preparado" o "no_preparado"' })
    }
    const Orden = getOrdenModel(req.db)
    const Ticket = getTicketModel(req.db)
    const orden = await Orden.findByIdAndUpdate(id, { estadoPreparacion }, { new: true })
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' })
    await Ticket.create({
      numeroTicket: `TK-${orden.ordenNumero}-PREP-${Date.now()}`,
      ordenId: orden._id,
      tipo: 'actualización',
      descripcion: `Preparación: ${estadoPreparacion === 'preparado' ? '✓ Marcado como preparado' : 'Marcado como no preparado'}`,
      cambios: { campo: 'estadoPreparacion', valorNuevo: estadoPreparacion },
      creador: 'sistema',
    })
    res.json({ orden: orden.toObject() })
  } catch (err) {
    console.error('[Ordenes] Error actualizando preparación:', err.message)
    res.status(500).json({ error: 'Error al actualizar preparación' })
  }
}

export async function actualizarPago(req, res) {
  try {
    const { id } = req.params
    const { estadoPago } = req.body
    if (!['pagado', 'no_pagado'].includes(estadoPago)) {
      return res.status(400).json({ error: 'estadoPago debe ser "pagado" o "no_pagado"' })
    }
    const Orden = getOrdenModel(req.db)
    const Ticket = getTicketModel(req.db)
    const orden = await Orden.findByIdAndUpdate(id, { estadoPago }, { new: true })
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' })
    await Ticket.create({
      numeroTicket: `TK-${orden.ordenNumero}-PAGO-${Date.now()}`,
      ordenId: orden._id,
      tipo: estadoPago === 'pagado' ? 'pago_recibido' : 'actualización',
      descripcion: estadoPago === 'pagado' ? '✓ Pago confirmado manualmente' : 'Pago revertido manualmente',
      cambios: { campo: 'estadoPago', valorNuevo: estadoPago },
      creador: 'sistema',
    })
    if (estadoPago === 'pagado') {
      crearYEmitir(req.db, req.tenantDbName, {
        tipo: 'orden_pago',
        titulo: 'Pago confirmado',
        mensaje: `Pago recibido para la orden ${orden.ordenNumero} de ${orden.cliente?.nombre || ''}`,
        meta: { id: id, ordenNumero: orden.ordenNumero },
      })
    }
    res.json({ orden: orden.toObject() })
  } catch (err) {
    console.error('[Ordenes] Error actualizando pago:', err.message)
    res.status(500).json({ error: 'Error al actualizar pago' })
  }
}

export async function cancelarOrden(req, res) {
  try {
    const { id } = req.params
    const { motivo } = req.body
    const Orden = getOrdenModel(req.db)
    const Ticket = getTicketModel(req.db)
    const Producto = getProductoModel(req.db)
    const orden = await Orden.findById(id)
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' })
    if (!['pendiente', 'procesando'].includes(orden.estado)) {
      return res.status(400).json({ error: `No se puede cancelar orden en estado: ${orden.estado}` })
    }
    for (const prod of orden.productos) {
      await Producto.findByIdAndUpdate(prod.productoId, { $inc: { stock: prod.cantidad } })
    }
    orden.estado = 'cancelada'
    await orden.save()
    const ticket = await Ticket.create({
      numeroTicket: `TK-${orden.ordenNumero}-CANCEL`,
      ordenId: orden._id,
      tipo: 'cancelacion',
      descripcion: motivo || 'Orden cancelada',
      cambios: { campo: 'estado', valorAnterior: 'procesando', valorNuevo: 'cancelada' },
    })
    crearYEmitir(req.db, req.tenantDbName, {
      tipo: 'orden_cancelada',
      titulo: 'Orden cancelada',
      mensaje: `La orden ${orden.ordenNumero} fue cancelada${motivo ? `: ${motivo}` : ''}`,
      meta: { id: id, ordenNumero: orden.ordenNumero },
    })
    res.json({ orden: orden.toObject(), ticket })
  } catch (err) {
    console.error('[Ordenes] Error cancelando:', err.message)
    res.status(500).json({ error: 'Error al cancelar orden' })
  }
}

export async function obtenerGanancias(req, res) {
  try {
    const { desde, hasta } = req.query
    const Orden = getOrdenModel(req.db)
    const Producto = getProductoModel(req.db)

    // Filtro: órdenes completadas (pagadas y preparadas)
    const filtro = {
      estadoPago: 'pagado',
      estadoPreparacion: 'preparado',
    }

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

    // Recorrer cada orden completada
    for (const orden of ordenes) {
      for (const item of orden.productos) {
        const producto = await Producto.findById(item.productoId).lean()

        // Precio cliente (lo que se cobró) - usar precioUnitario del modelo
        const precioCliente = item.precioUnitario || 0
        const cantidad = item.cantidad || 1
        const subtotalVenta = precioCliente * cantidad

        totalVendido += subtotalVenta

        if (producto) {
          // Calcular utilidad basada en el porcentaje configurado
          const utilidadPorcentaje = producto.utilidad || 30
          const montoUtilidad = (precioCliente * utilidadPorcentaje) / 100
          const montoGananciaNeta = precioCliente - montoUtilidad

          totalUtilidad += montoUtilidad * cantidad
          totalGananciaNeta += montoGananciaNeta * cantidad

          // Detalle por producto
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

    res.json({
      resumen: {
        totalVendido: Math.round(totalVendido),
        totalUtilidad: Math.round(totalUtilidad),
        totalGananciaNeta: Math.round(totalGananciaNeta),
        cantidadOrdenes: ordenes.length,
      },
      detalleProductos: Object.values(detalleProductos),
    })
  } catch (err) {
    console.error('[Ordenes] Error obteniendo ganancias:', err.message)
    res.status(500).json({ error: 'Error al obtener ganancias' })
  }
}
