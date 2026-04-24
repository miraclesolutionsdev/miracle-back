import { Router } from 'express'
import {
  listarOrdenes,
  obtenerOrden,
  crearOrden,
  actualizarEstadoOrden,
  actualizarPreparacion,
  actualizarPago,
  crearTicketManual,
  cancelarOrden,
  obtenerGanancias,
} from '../controllers/orden.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'

const router = Router()

// Todas las rutas de órdenes requieren autenticación
router.use(requireAuth)

router.get('/', listarOrdenes)
router.get('/ganancias/resumen', obtenerGanancias)
router.get('/:id', obtenerOrden)
router.post('/', crearOrden)
router.patch('/:id/estado', actualizarEstadoOrden)
router.patch('/:id/preparacion', actualizarPreparacion)
router.patch('/:id/pago', actualizarPago)
router.patch('/:id/cancelar', cancelarOrden)
router.post('/:id/tickets', crearTicketManual)

export default router
