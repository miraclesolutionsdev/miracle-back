import { Router } from "express"
import { login, register, crearTienda } from "../controllers/auth.controller.js"

const router = Router()
router.post("/login", login)
router.post("/register", register)
router.post("/crear-tienda", crearTienda)
export default router
