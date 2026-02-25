import { Router } from "express"
import { requireAuth } from "../middleware/auth.middleware.js"
import {
  login,
  register,
  crearTienda,
  obtenerPerfil,
  actualizarPerfil,
  cambiarPassword,
  actualizarTenant,
} from "../controllers/auth.controller.js"

const router = Router()
router.post("/login", login)
router.post("/register", register)
router.post("/crear-tienda", crearTienda)
router.get("/me", requireAuth, obtenerPerfil)
router.patch("/me", requireAuth, actualizarPerfil)
router.post("/cambiar-password", requireAuth, cambiarPassword)
router.patch("/tenant", requireAuth, actualizarTenant)
export default router
