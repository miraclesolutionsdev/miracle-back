import { Router } from "express"
import multer from "multer"
import {
  listarTodos,
  obtenerUno,
  crear,
  actualizar,
  inactivar,
  obtenerImagen,
} from "../controllers/producto.controller.js"

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

router.get("/", listarTodos)
router.get("/:id/imagenes/:index", obtenerImagen)
router.get("/:id", obtenerUno)
router.post("/", upload.array("imagenes", 10), crear)
router.put("/:id", upload.array("imagenes", 10), actualizar)
router.patch("/:id/inactivar", inactivar)

export default router
