import { Router } from "express"
import {
  listarTodos,
  obtenerUno,
  crear,
  actualizar,
} from "../controllers/cliente.controller.js"

const router = Router()

router.get("/", listarTodos)
router.get("/:id", obtenerUno)
router.post("/", crear)
router.put("/:id", actualizar)

export default router
