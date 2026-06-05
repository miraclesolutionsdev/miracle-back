import { Router } from "express"
import rateLimit from "express-rate-limit"
import { requireAuth } from "../middleware/auth.middleware.js"
import { tenantMiddleware } from "../middleware/tenant.middleware.js"
import {
  loginGlobal,
  login,
  logout,
  obtenerPerfil,
  actualizarPerfil,
  cambiarPassword,
} from "../controllers/auth.controller.js"

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
})

const router = Router()

// Público — no requiere tenant
router.post("/login-global", loginLimiter, loginGlobal)

// Con tenant — tenantMiddleware antes de requireAuth porque auth valida req.tenantSlug
router.post("/login", loginLimiter, login)
router.post("/logout", logout)
router.get("/me", tenantMiddleware, requireAuth, obtenerPerfil)
router.patch("/me", tenantMiddleware, requireAuth, actualizarPerfil)
router.post("/cambiar-password", tenantMiddleware, requireAuth, cambiarPassword)

export default router
