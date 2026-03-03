import { Router } from "express"
import { listar, obtenerUno, crear, actualizar, actualizarEstado } from "../controllers/campana.controller.js"
import { requireAuth } from "../middleware/auth.middleware.js"

const router = Router()

// Todas las rutas de campañas requieren autenticación para tener tenantId
router.use(requireAuth)

router.get("/", listar)
router.get("/:id", obtenerUno)
router.post("/", crear)
router.put("/:id", actualizar)
router.patch("/:id/estado", actualizarEstado)

export default router
