import { Router } from "express"
import rateLimit from "express-rate-limit"
import { requireAuth } from "../middleware/auth.middleware.js"
import {
  login,
  logout,
  obtenerPerfil,
  actualizarPerfil,
  cambiarPassword,
} from "../controllers/auth.controller.js"

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5,
  message: { error: "Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
})

const router = Router()
router.post("/login", loginLimiter, login)
router.post("/logout", logout)
router.get("/me", requireAuth, obtenerPerfil)
router.patch("/me", requireAuth, actualizarPerfil)
router.post("/cambiar-password", requireAuth, cambiarPassword)
export default router
