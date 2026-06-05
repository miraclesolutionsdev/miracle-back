import { getContadorModel } from '../models/contador.model.js'

/**
 * Genera un número de orden único con formato YYYYMMDD-XXX
 * Ejemplo: 20250325-001, 20250325-002
 * Recibe la conexión db del tenant activo.
 */
export async function generarNumeroOrden(db) {
  const hoy = new Date()
  const fechaStr = hoy.toISOString().split('T')[0].replace(/-/g, '') // YYYYMMDD
  const Contador = getContadorModel(db)
  try {
    const contador = await Contador.findByIdAndUpdate(
      'ordenNumero',
      [
        {
          $set: {
            fecha: fechaStr,
            contador: {
              $cond: [
                { $eq: ['$fecha', fechaStr] },
                { $add: ['$contador', 1] },
                1,
              ],
            },
          },
        },
      ],
      { upsert: true, new: true, updatePipeline: true }
    )
    const numeroFormateado = String(contador.contador).padStart(3, '0')
    return `${fechaStr}-${numeroFormateado}`
  } catch (err) {
    console.error('[generarNumeroOrden] Error:', err.message)
    throw new Error('No se pudo generar número de orden')
  }
}

/**
 * Valida transiciones de estado permitidas en una Orden.
 */
export function esTransicionValida(estadoActual, estadoNuevo) {
  const transicionesPermitidas = {
    pendiente:  ['procesando', 'cancelada'],
    procesando: ['completada', 'cancelada'],
    completada: ['entregada', 'cancelada'],
    entregada:  [],
    cancelada:  [],
  }
  if (!transicionesPermitidas[estadoActual]) {
    console.warn(`[esTransicionValida] Estado actual inválido: ${estadoActual}`)
    return false
  }
  return transicionesPermitidas[estadoActual].includes(estadoNuevo)
}

/**
 * Calcula totales de una orden a partir de su array de productos.
 */
export function calcularTotalesOrden(productos = []) {
  if (!Array.isArray(productos) || productos.length === 0) {
    return { totalMonto: 0, productosCalculados: [] }
  }
  let totalMonto = 0
  const productosCalculados = productos.map((prod) => {
    const cantidad = Number(prod.cantidad) || 1
    const precioUnitario = Number(prod.precioUnitario) || 0
    const precioTotal = cantidad * precioUnitario
    totalMonto += precioTotal
    return { ...prod, cantidad, precioUnitario, precioTotal }
  })
  return { totalMonto, productosCalculados }
}

