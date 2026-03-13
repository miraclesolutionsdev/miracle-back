import { Router } from 'express'
import { crearPreferencia, recibirWebhook } from '../controllers/pago.controller.js'

const router = Router()

router.post('/crear-preferencia', crearPreferencia)
router.post('/webhook', recibirWebhook)

export default router
