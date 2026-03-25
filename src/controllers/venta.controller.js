import Orden from '../models/orden.model.js'

/**
 * Listar órdenes (compatibilidad con ruta /ventas)
 * Para acceso a órdenes con todos los detalles, usar GET /ordenes
 */
export async function listarVentas(req, res) {
  try {
    const { estado, limit = 10, skip = 0 } = req.query

    const filtro = {}
    if (estado) filtro.estado = estado

    const ordenes = await Orden.find(filtro)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit), 100))
      .skip(Number(skip))
      .lean()

    const total = await Orden.countDocuments(filtro)

    res.json({
      ordenes: ordenes.map(o => ({
        id: o._id.toString(),
        ordenNumero: o.ordenNumero,
        clienteNombre: o.cliente.nombre,
        clienteEmail: o.cliente.email,
        productoNombre: o.productos[0]?.productoNombre || 'Múltiples',
        monto: o.totalMonto,
        estado: o.estado,
        metodoPago: o.metodoPago,
        pagoId: o.pagoId || null,
        fecha: o.createdAt,
      })),
      total,
      limit: Number(limit),
      skip: Number(skip),
    })
  } catch (err) {
    console.error('[Ventas] Error al listar:', err.message)
    res.status(500).json({ error: 'Error al obtener órdenes' })
  }
}
