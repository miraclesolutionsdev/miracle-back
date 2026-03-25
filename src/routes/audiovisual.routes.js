import { Router } from "express"
import multer from "multer"
import {
  listar,
  crear,
  actualizarEstado,
  obtenerPresignedUrl,
  confirmarSubida,
} from "../controllers/audiovisual.controller.js"
import { requireAuth } from "../middleware/auth.middleware.js"

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
})

router.use(requireAuth)

router.get("/", listar)
router.post("/presigned-url", obtenerPresignedUrl)
router.post("/confirmar", confirmarSubida)
router.post("/", upload.single("archivo"), crear)
router.patch("/:id/estado", actualizarEstado)

export default router
