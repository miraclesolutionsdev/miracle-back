import { Router } from 'express'
import { resolverPorDominio, infoTienda, guardarInfo, guardarDominio, guardarPlantilla } from '../controllers/storeConfig.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { tenantMiddleware } from '../middleware/tenant.middleware.js'

const router = Router()

// Públicos — sin tenant middleware (se montan antes del tenantMiddleware global en server.js)
router.get('/dominio', resolverPorDominio)
router.get('/info', infoTienda)

// Protegidos — tenantMiddleware antes de requireAuth porque auth valida req.tenantSlug
router.patch('/info', tenantMiddleware, requireAuth, guardarInfo)
router.patch('/dominio', tenantMiddleware, requireAuth, guardarDominio)
router.patch('/plantilla', tenantMiddleware, requireAuth, guardarPlantilla)

export default router
