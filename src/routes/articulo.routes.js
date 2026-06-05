import { Router } from "express"
import multer from "multer"
import { requireAuth } from "../middleware/auth.middleware.js"
import { listarTodos, obtenerUno, crear, actualizar, eliminar } from "../controllers/articulo.controller.js"

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

// Públicos — tienda pública los consume con X-Tenant-Slug
router.get("/", listarTodos)
router.get("/:id", obtenerUno)

// Protegidos — solo admins del tenant
router.post("/", requireAuth, upload.single("imagen"), crear)
router.put("/:id", requireAuth, upload.single("imagen"), actualizar)
router.delete("/:id", requireAuth, eliminar)

export default router
