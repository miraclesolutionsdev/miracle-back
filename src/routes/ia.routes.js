import { Router } from "express"
import { requireAuth } from "../middleware/auth.middleware.js"
import {
  generarAngulosParaProducto,
  generarCopysParaProducto,
  generarGuionDesdeImagen,
} from "../services/iaCopy.service.js"

const router = Router()

// Genera SOLO ángulos para un producto
router.post("/angulos", requireAuth, async (req, res) => {
  try {
    const { producto, historial = [] } = req.body

    if (!producto || !producto.nombre) {
      return res
        .status(400)
        .json({ error: "Faltan datos del producto. Se requiere al menos 'nombre'." })
    }

    const resultado = await generarAngulosParaProducto(producto, historial)
    res.json(resultado)
  } catch (error) {
    console.error("[ia.routes] Error al generar ángulos:", error)
    res.status(500).json({ error: "No se pudieron generar los ángulos con la IA." })
  }
})

// Genera copys (TOF/MOF/BOF) para un ÁNGULO concreto de un producto
router.post("/copys", requireAuth, async (req, res) => {
  try {
    const { producto, angulo, historial = [] } = req.body

    if (!producto || !producto.nombre) {
      return res
        .status(400)
        .json({ error: "Faltan datos del producto. Se requiere al menos 'nombre'." })
    }

    if (!angulo || !angulo.nombre) {
      return res
        .status(400)
        .json({ error: "Faltan datos del ángulo. Se requiere al menos 'nombre'." })
    }

    const resultado = await generarCopysParaProducto(producto, angulo, historial)
    res.json(resultado)
  } catch (error) {
    console.error("[ia.routes] Error al generar copys:", error)
    res.status(500).json({ error: "No se pudieron generar los copys con la IA." })
  }
})

// Genera guion audiovisual y copy de plataforma a partir de una imagen + copy base
router.post("/guion-imagen", requireAuth, async (req, res) => {
  try {
    const { payload, historial = [] } = req.body

    if (!payload || !payload.producto || !payload.copy_base || !payload.imagen) {
      return res.status(400).json({
        error:
          "Faltan datos para generar el guion desde imagen. Se requiere al menos 'producto', 'copy_base' e 'imagen'.",
      })
    }

    const resultado = await generarGuionDesdeImagen(payload, historial)
    res.json(resultado)
  } catch (error) {
    console.error("[ia.routes] Error al generar guion desde imagen:", error)
    res
      .status(500)
      .json({ error: "No se pudo generar el guion desde la imagen con la IA." })
  }
})

export default router

