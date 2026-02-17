import { Router } from "express"
import multer from "multer"
import { listar, crear, actualizarEstado } from "../controllers/audiovisual.controller.js"

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
})

router.get("/", listar)
router.post("/", upload.single("archivo"), crear)
router.patch("/:id/estado", actualizarEstado)

export default router
