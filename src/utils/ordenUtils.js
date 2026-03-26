import Contador from '../models/contador.model.js'

/**
 * Genera un número de orden único con formato YYYYMMDD-XXX
 * Ejemplo: 20250325-001, 20250325-002
 *
 * Usa colección Contador para mantener secuencia diaria.
 * Cada día reinicia la numeración.
 */
export async function generarNumeroOrden() {
  const hoy = new Date()
  const fechaStr = hoy.toISOString().split('T')[0].replace(/-/g, '') // YYYYMMDD

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
                { $add: ['$contador', 1] }, // Mismo día: incrementar
                1, // Nuevo día: reiniciar
              ],
            },
          },
        },
      ],
      { upsert: true, new: true }
    )

    const numeroFormateado = String(contador.contador).padStart(3, '0')
    return `${fechaStr}-${numeroFormateado}`
  } catch (err) {
    console.error('[generarNumeroOrden] Error:', err.message)
    throw new Error('No se pudo generar número de orden')
  }
}

/**
 * Valida transiciones de estado permitidas en una Orden
 * Máquina de estados:
 *   pendiente → procesando | cancelada
 *   procesando → completada | cancelada
 *   completada → entregada | cancelada
 *   entregada → (solo lectura, sin transiciones)
 *   cancelada → (solo lectura, sin transiciones)
 */
export function esTransicionValida(estadoActual, estadoNuevo) {
  const transicionesPermitidas = {
    pendiente: ['procesando', 'cancelada'],
    procesando: ['completada', 'cancelada'],
    completada: ['entregada', 'cancelada'],
    entregada: [], // Terminal
    cancelada: [], // Terminal
  }

  if (!transicionesPermitidas[estadoActual]) {
    console.warn(`[esTransicionValida] Estado actual inválido: ${estadoActual}`)
    return false
  }

  const permitidas = transicionesPermitidas[estadoActual]
  return permitidas.includes(estadoNuevo)
}

/**
 * Calcula totales de una orden a partir de su array de productos
 * Cada producto debe tener: cantidad, precioUnitario
 */
export function calcularTotalesOrden(productos = []) {
  if (!Array.isArray(productos) || productos.length === 0) {
    return {
      totalMonto: 0,
      productosCalculados: [],
    }
  }

  let totalMonto = 0
  const productosCalculados = productos.map((prod) => {
    const cantidad = Number(prod.cantidad) || 1
    const precioUnitario = Number(prod.precioUnitario) || 0
    const precioTotal = cantidad * precioUnitario

    totalMonto += precioTotal

    return {
      ...prod,
      cantidad,
      precioUnitario,
      precioTotal,
    }
  })

  return {
    totalMonto,
    productosCalculados,
  }
}

/**
 * Mapeos auxiliares para UI (colores, estilos)
 */
export const estadoOrdenStyleMap = {
  pendiente: { color: '#FFC107', label: 'Pendiente' },
  procesando: { color: '#2196F3', label: 'Procesando' },
  completada: { color: '#4CAF50', label: 'Completada' },
  entregada: { color: '#558B2F', label: 'Entregada' },
  cancelada: { color: '#F44336', label: 'Cancelada' },
}

export const tipoTicketIconMap = {
  creacion: '📋',
  pago_recibido: '✅',
  procesamiento_inicio: '⏱️',
  envio: '📦',
  entrega: '🎁',
  problema: '⚠️',
  cancelacion: '❌',
  actualización: '🔄',
}
