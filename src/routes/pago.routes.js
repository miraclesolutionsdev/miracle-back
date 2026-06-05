import { Router } from 'express'
import { crearPreferencia, recibirWebhook } from '../controllers/pago.controller.js'
import { webhookTenantMiddleware } from '../middleware/webhookTenant.middleware.js'

const router = Router()

router.post('/crear-preferencia', crearPreferencia)
// Webhook va antes del tenantMiddleware global — se monta en server.js antes de app.use(tenantMiddleware)
router.post('/webhook', webhookTenantMiddleware, recibirWebhook)

export default router
