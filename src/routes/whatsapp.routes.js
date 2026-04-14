import { Router } from 'express'
import {
  listarConversaciones,
  obtenerConversacion,
  listarLeadsWhatsapp,
  obtenerLeadWhatsapp,
  actualizarLeadWhatsapp,
} from '../controllers/whatsapp.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'

const router = Router()

// NOTA: Las rutas públicas (crear-orden, webhook/conversation) están en server.js
// antes del tenantMiddleware para que no requieran X-Tenant-Slug

// Conversaciones de ElevenLabs API (legacy - se mantiene por compatibilidad)
router.get('/conversaciones', requireAuth, listarConversaciones)
router.get('/conversaciones/:id', requireAuth, obtenerConversacion)

// Leads de WhatsApp desde BD local (nueva implementación recomendada)
router.get('/leads', requireAuth, listarLeadsWhatsapp)
router.get('/leads/:id', requireAuth, obtenerLeadWhatsapp)
router.patch('/leads/:id', requireAuth, actualizarLeadWhatsapp)

export default router
