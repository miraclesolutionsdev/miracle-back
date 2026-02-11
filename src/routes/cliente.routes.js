import { Router } from "express"
import {
  listarTodos,
  obtenerUno,
  crear,
  actualizar,
  inactivar,
} from "../controllers/cliente.controller.js"

const router = Router()

router.get("/", listarTodos)
router.get("/:id", obtenerUno)
router.post("/", crear)
router.put("/:id", actualizar)
router.patch("/:id/inactivar", inactivar)

export default router
