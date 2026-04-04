import { Router } from "express"
import rateLimit from "express-rate-limit"
import { registrarTenant } from "../controllers/register.controller.js"

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,
  message: { error: "Demasiados intentos de registro. Intenta de nuevo en 1 hora." },
  standardHeaders: true,
  legacyHeaders: false,
})

const router = Router()
router.post("/", registerLimiter, registrarTenant)
export default router
