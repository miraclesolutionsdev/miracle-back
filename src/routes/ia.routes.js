import { Router } from "express"
import { requireAuth } from "../middleware/auth.middleware.js"
import {
  generarAngulosParaProducto,
  generarCopysParaProducto,
  generarGuionDesdeImagen,
  generarCopyDesdeImagen,
} from "../services/iaCopy.service.js"
import { generarImagenDesdePrompt } from "../services/iaImagen.service.js"
import { iniciarVideoGrok } from "../services/iaVideo.service.js"

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

// Genera imagen a partir de un prompt (Google Imagen / Gemini)
router.post("/generar-imagen", requireAuth, async (req, res) => {
  try {
    const { prompt, aspectRatio = "1:1" } = req.body || {}

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({
        error: "Falta 'prompt' en el cuerpo para generar la imagen.",
      })
    }

    const resultado = await generarImagenDesdePrompt(prompt.trim(), aspectRatio)
    res.json(resultado)
  } catch (error) {
    console.error("[ia.routes] Error al generar imagen:", error)
    res
      .status(500)
      .json({ error: error.message || "No se pudo generar la imagen con la IA." })
  }
})

// Genera copy directo a partir de una imagen (visión)
router.post("/copy-desde-imagen", requireAuth, async (req, res) => {
  try {
    const { imagenDataUrl, historial = [] } = req.body || {}

    if (!imagenDataUrl) {
      return res.status(400).json({
        error:
          "Falta 'imagenDataUrl' en el cuerpo de la petición para generar el copy desde imagen.",
      })
    }

    // Para este flujo creativo, priorizamos SIEMPRE lo que se ve en la imagen.
    // No se pasa contexto de producto para evitar que la IA fuerce un producto concreto.
    const resultado = await generarCopyDesdeImagen(imagenDataUrl, {}, historial)
    res.json(resultado)
  } catch (error) {
    console.error("[ia.routes] Error al generar copy desde imagen:", error)
    res
      .status(500)
      .json({ error: "No se pudo generar el copy desde la imagen con la IA." })
  }
})

// Inicia la generación de un video en Grok a partir de un copy + imagen
router.post("/generar-video", requireAuth, async (req, res) => {
  try {
    const { prompt, imageUrl, duration = 5 } = req.body || {}

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res
        .status(400)
        .json({ error: "Falta 'prompt' para generar el video." })
    }

    if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.trim()) {
      return res
        .status(400)
        .json({ error: "Falta 'imageUrl' para generar el video." })
    }

    const resultado = await iniciarVideoGrok({ prompt, imageUrl, duration })
    res.json(resultado)
  } catch (error) {
    console.error("[ia.routes] Error al generar video con Grok:", error)
    res.status(500).json({
      error:
        error.message ||
        "No se pudo iniciar la generación del video con la IA de Grok.",
    })
  }
})

export default router

