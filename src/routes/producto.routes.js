import { Router } from "express"
import multer from "multer"
import { requireAuth } from "../middleware/auth.middleware.js"
import {
  listarTodos,
  obtenerUno,
  crear,
  actualizar,
  inactivar,
  obtenerImagen,
  eliminarImagen,
} from "../controllers/producto.controller.js"

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

// Lectura pública (landing de producto y tienda no requieren login)
router.get("/", listarTodos)
router.get("/:id/imagenes/:index", obtenerImagen)
router.get("/:id", obtenerUno)

// Escritura protegida (solo usuarios autenticados)
router.post("/", requireAuth, upload.array("imagenes", 10), crear)
router.put("/:id", requireAuth, upload.array("imagenes", 10), actualizar)
router.patch("/:id/inactivar", requireAuth, inactivar)
router.delete("/:id/imagenes/:index", requireAuth, eliminarImagen)

export default router
