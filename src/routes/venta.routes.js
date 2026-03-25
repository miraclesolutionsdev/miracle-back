import { Router } from 'express'
import { listarVentas } from '../controllers/venta.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'

const router = Router()

router.get('/', requireAuth, listarVentas)

export default router
