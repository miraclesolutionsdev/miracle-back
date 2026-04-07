import { Router } from 'express'
import { resolverPorDominio, infoTienda, guardarDominio } from '../controllers/storeConfig.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'

const router = Router()

// Públicos
router.get('/dominio', resolverPorDominio)
router.get('/info', infoTienda)

// Protegido — el admin guarda su dominio custom desde la plataforma
router.patch('/dominio', requireAuth, guardarDominio)

export default router
