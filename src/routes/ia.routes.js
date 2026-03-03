import { Router } from "express"
import { requireAuth } from "../middleware/auth.middleware.js"
import { generarCopysParaProducto } from "../services/iaCopy.service.js"

const router = Router()

// Genera ángulos y copys (TOF/MOF/BOF) para un producto dado
router.post("/copys", requireAuth, async (req, res) => {
  try {
    const { producto, historial = [] } = req.body

    if (!producto || !producto.nombre) {
      return res
        .status(400)
        .json({ error: "Faltan datos del producto. Se requiere al menos 'nombre'." })
    }

    const resultado = await generarCopysParaProducto(producto, historial)
    res.json(resultado)
  } catch (error) {
    console.error("[ia.routes] Error al generar copys:", error)
    res.status(500).json({ error: "No se pudieron generar los copys con la IA." })
  }
})

export default router

