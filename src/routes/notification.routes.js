import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import {
  stream,
  listar,
  marcarTodasLeidas,
  marcarLeida,
} from '../controllers/notification.controller.js'

const router = Router()

// SSE — auth inline (EventSource no soporta Authorization header)
router.get('/stream', stream)

// REST — auth via middleware
router.get('/', requireAuth, listar)
router.patch('/leer-todas', requireAuth, marcarTodasLeidas)
router.patch('/:id/leer', requireAuth, marcarLeida)

export default router
