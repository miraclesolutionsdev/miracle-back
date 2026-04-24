import { Router } from 'express'
import { crearPreferencia } from '../controllers/pago.controller.js'

const router = Router()

router.post('/crear-preferencia', crearPreferencia)
// NOTA: /webhook se maneja directamente en server.js antes del tenantMiddleware

export default router
