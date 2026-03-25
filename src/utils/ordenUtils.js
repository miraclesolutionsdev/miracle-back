import Contador from '../models/contador.model.js'

/**
 * ===== GENERACIÓN DE ORDEN NÚMERO =====
 * Genera números secuenciales: YYYYMMDD-XXX
 * Reset diario automático
 */

export async function generarNumeroOrden() {
  const hoy = new Date()
  const fechaStr = hoy.toISOString().split('T')[0].replace(/-/g, '') // YYYYMMDD

  try {
    const contador = await Contador.findByIdAndUpdate(
      'ordenNumero',
      {
        $set: { fecha: fechaStr },
        $inc: { contador: 1 },
      },
      { upsert: true, new: true }
    )

    // Si la fecha cambió desde el último acceso, resetear contador
    if (contador.fecha !== fechaStr) {
      const nuevoContador = await Contador.findByIdAndUpdate(
        'ordenNumero',
        { fecha: fechaStr, contador: 1 },
        { new: true }
      )
      return `${fechaStr}-${String(nuevoContador.contador).padStart(3, '0')}`
    }

    return `${fechaStr}-${String(contador.contador).padStart(3, '0')}`
  } catch (err) {
    console.error('[OrdenUtils] Error generando número de orden:', err.message)
    throw new Error('No se pudo generar número de orden')
  }
}

/**
 * ===== VALIDACIÓN DE TRANSICIONES DE ESTADO =====
 * Define estados válidos y transiciones permitidas
 */

const TRANSICIONES_VALIDAS = {
  pendiente: ['procesando', 'cancelada'],
  procesando: ['completada', 'cancelada'],
  completada: ['entregada'],
  entregada: [], // Terminal
  cancelada: [], // Terminal
}

export function esTransicionValida(estadoActual, estadoNuevo) {
  if (!TRANSICIONES_VALIDAS[estadoActual]) {
    return false
  }
  return TRANSICIONES_VALIDAS[estadoActual].includes(estadoNuevo)
}

export function obtenerEstadosPermitidos(estadoActual) {
  return TRANSICIONES_VALIDAS[estadoActual] || []
}

/**
 * ===== CÁLCULO DE TOTALES =====
 * Calcula subtotal y total de una orden
 */

export function calcularTotalesOrden(productos) {
  if (!Array.isArray(productos) || productos.length === 0) {
    return { subtotal: 0, total: 0 }
  }

  const subtotal = productos.reduce((sum, prod) => {
    const total = (prod.cantidad || 0) * (prod.precioUnitario || 0)
    return sum + total
  }, 0)

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    total: Math.round(subtotal * 100) / 100, // En Fase 1, no hay impuestos
  }
}

/**
 * ===== MAPEO DE COLORES DE BADGEST POR TIPO DE TICKET =====
 */

export const TICKET_TIPO_STYLE = {
  creacion: { badge: 'bg-blue-500/10 text-blue-400', icono: '📝' },
  pago_recibido: { badge: 'bg-green-500/10 text-green-400', icono: '✓' },
  procesamiento_inicio: { badge: 'bg-purple-500/10 text-purple-400', icono: '⚙️' },
  envio: { badge: 'bg-orange-500/10 text-orange-400', icono: '📦' },
  entrega: { badge: 'bg-green-500/10 text-green-500', icono: '🎉' },
  problema: { badge: 'bg-red-500/10 text-red-400', icono: '⚠️' },
  cancelacion: { badge: 'bg-red-500/10 text-red-500', icono: '❌' },
  actualización: { badge: 'bg-gray-500/10 text-gray-400', icono: '🔄' },
}

/**
 * ===== MAPEO DE COLORES POR ESTADO DE ORDEN =====
 */

export const ESTADO_ORDEN_STYLE = {
  pendiente: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  procesando: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  completada: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  entregada: 'bg-green-500/10 text-green-400 border border-green-500/20',
  cancelada: 'bg-red-500/10 text-red-500 border border-red-500/20',
}

/**
 * ===== ETIQUETAS LEGIBLES PARA ESTADOS =====
 */

export const ESTADO_ETIQUETA = {
  pendiente: 'Pendiente',
  procesando: 'Procesando',
  completada: 'Completada',
  entregada: 'Entregada',
  cancelada: 'Cancelada',
}
