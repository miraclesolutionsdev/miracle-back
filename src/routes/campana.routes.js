import { Router } from "express"
import { listar, obtenerUno, crear, actualizar, actualizarEstado } from "../controllers/campana.controller.js"

const router = Router()

router.get("/", listar)
router.get("/:id", obtenerUno)
router.post("/", crear)
router.put("/:id", actualizar)
router.patch("/:id/estado", actualizarEstado)

export default router
