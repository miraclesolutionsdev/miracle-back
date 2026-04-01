import { Router } from 'express'
import { crearOrdenWhatsApp } from '../controllers/whatsapp.controller.js'

const router = Router()

// Llamado por el tool de ElevenLabs cuando el bot cierra una venta
router.post('/crear-orden', crearOrdenWhatsApp)

export default router
