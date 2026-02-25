import { Router } from "express"
import { listar, crear, actualizar, eliminar } from "../controllers/user.controller.js"

const router = Router()

router.get("/", listar)
router.post("/", crear)
router.patch("/:id", actualizar)
router.delete("/:id", eliminar)

export default router
