import { getOrdenModel } from '../models/orden.model.js'
import { getTicketModel } from '../models/ticket.model.js'
import { getProductoModel } from '../models/producto.model.js'
import { getClienteModel } from '../models/cliente.model.js'
import {
  generarNumeroOrden,
  esTransicionValida,
  calcularTotalesOrden,
} from '../utils/ordenUtils.js'

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
    res.json({ orden: orden.toObject(), ticket })
  } catch (err) {
    console.error('[Ordenes] Error cancelando:', err.message)
    res.status(500).json({ error: 'Error al cancelar orden' })
  }
}
