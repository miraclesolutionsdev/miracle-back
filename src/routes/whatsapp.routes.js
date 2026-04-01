import { Router } from 'express'
import { crearOrdenWhatsApp, listarConversaciones, obtenerConversacion } from '../controllers/whatsapp.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'

const router = Router()

// Llamado por el tool de ElevenLabs cuando el bot cierra una venta (público, con x-api-key)
router.post('/crear-orden', crearOrdenWhatsApp)

// Conversaciones de ElevenLabs (requieren auth de plataforma)
router.get('/conversaciones', requireAuth, listarConversaciones)
router.get('/conversaciones/:id', requireAuth, obtenerConversacion)

export default router
