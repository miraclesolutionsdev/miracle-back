import { Router } from 'express'
import { crearPreferencia, recibirWebhook, webhookTest } from '../controllers/pago.controller.js'

const router = Router()

router.post('/crear-preferencia', crearPreferencia)
router.post('/webhook', recibirWebhook)
router.post('/dev/simular', webhookTest)

export default router
