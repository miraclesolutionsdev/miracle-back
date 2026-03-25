import { Router } from "express"
import { requireAuth } from "../middleware/auth.middleware.js"
import {
  login,
  crearTienda,
  obtenerPerfil,
  actualizarPerfil,
  cambiarPassword,
  actualizarTenant,
  obtenerPresignedLogoTenant,
} from "../controllers/auth.controller.js"

const router = Router()
router.post("/login", login)
router.post("/crear-tienda", crearTienda)
router.get("/me", requireAuth, obtenerPerfil)
router.patch("/me", requireAuth, actualizarPerfil)
router.post("/cambiar-password", requireAuth, cambiarPassword)
router.patch("/tenant", requireAuth, actualizarTenant)
router.post("/tenant/logo/presigned", requireAuth, obtenerPresignedLogoTenant)
export default router
