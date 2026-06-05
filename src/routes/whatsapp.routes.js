import { Router } from 'express'
import {
  crearOrdenWhatsApp,
  recibirWebhookConversacion,
  obtenerCatalogoWhatsapp,
  listarConversaciones,
  obtenerConversacion,
  listarLeadsWhatsapp,
  obtenerLeadWhatsapp,
  actualizarLeadWhatsapp,
} from '../controllers/whatsapp.controller.js'
import { tenantMiddleware } from '../middleware/tenant.middleware.js'
import { webhookTenantMiddleware } from '../middleware/webhookTenant.middleware.js'
import { requireAuth } from '../middleware/auth.middleware.js'

const router = Router()

// Públicos — con su propio middleware de tenant (van antes del tenantMiddleware global)
router.post('/webhook/conversation', webhookTenantMiddleware, recibirWebhookConversacion)
router.post('/crear-orden', tenantMiddleware, crearOrdenWhatsApp)
router.get('/catalogo/:slug', obtenerCatalogoWhatsapp)

// Protegidos
router.get('/conversaciones', requireAuth, listarConversaciones)
router.get('/conversaciones/:id', requireAuth, obtenerConversacion)
router.get('/leads', requireAuth, listarLeadsWhatsapp)
router.get('/leads/:id', requireAuth, obtenerLeadWhatsapp)
router.patch('/leads/:id', requireAuth, actualizarLeadWhatsapp)

export default router
