import { Router } from "express"
import { requireAuth } from "../middleware/auth.middleware.js"
import {
  generarAngulos,
  generarCopys,
  generarGuionImagen,
  generarImagen,
  generarCopyImagen,
  iniciarVideo,
  obtenerEstadoVideo,
  iniciarVoz,
  obtenerEstadoVoz,
} from "../controllers/ia.controller.js"

const router = Router()
router.use(requireAuth)

router.post("/angulos", generarAngulos)
router.post("/copys", generarCopys)
router.post("/guion-imagen", generarGuionImagen)
router.post("/generar-imagen", generarImagen)
router.post("/copy-desde-imagen", generarCopyImagen)

router.post("/generar-video-runway", iniciarVideo)
router.get("/video-runway-estado/:id", obtenerEstadoVideo)
router.post("/generar-voz-runway", iniciarVoz)
router.get("/voz-runway-estado/:id", obtenerEstadoVoz)

export default router
