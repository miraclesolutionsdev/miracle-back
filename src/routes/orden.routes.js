import { Router } from 'express'
import {
  listarOrdenes,
  obtenerOrden,
  crearOrden,
  actualizarEstadoOrden,
  crearTicketManual,
  cancelarOrden,
} from '../controllers/orden.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'

const router = Router()

// Todas las rutas de órdenes requieren autenticación
router.use(requireAuth)

router.get('/', listarOrdenes)
router.get('/:id', obtenerOrden)
router.post('/', crearOrden)
router.patch('/:id/estado', actualizarEstadoOrden)
router.patch('/:id/cancelar', cancelarOrden)
router.post('/:id/tickets', crearTicketManual)

export default router
