import mongoose from "mongoose"
import { Router } from "express"
import { requireAuth } from "../middleware/auth.middleware.js"
import IaResumen from "../models/iaResumen.model.js"
import {
  generarAngulosParaProducto,
  generarCopysParaProducto,
  generarGuionDesdeImagen,
  generarCopyDesdeImagen,
} from "../services/iaCopy.service.js"
import { generarImagenDesdePrompt } from "../services/iaImagen.service.js"
import { iniciarVideoRunway, obtenerEstadoVideoRunway, generarVozRunway, obtenerEstadoVozRunway } from "../services/iaVideo.service.js"
import { subirImagen } from "../services/s3.service.js"

const router = Router()

const tenantIdFromReq = (req) => {
  const id = req.tenantId
  if (!id) return null
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null
}

// Obtener resumen IA guardado (ángulo, copys, imágenes por copy)
router.get("/resumen", requireAuth, async (req, res) => {
  try {
    const tenantId = tenantIdFromReq(req)
    if (!tenantId) {
      return res.status(400).json({ error: "No se pudo identificar el tenant." })
    }
    const doc = await IaResumen.findOne({ tenantId })
    if (!doc) {
      return res.status(404).json({ error: "No hay resumen guardado." })
    }
    res.json({
      producto: doc.producto ?? null,
      angulo: doc.angulo ?? null,
      copys: Array.isArray(doc.copys) ? doc.copys : [],
      imagenPorCopy: doc.imagenPorCopy && typeof doc.imagenPorCopy === "object" ? doc.imagenPorCopy : {},
      mensajes: Array.isArray(doc.mensajes) ? doc.mensajes : [],
    })
  } catch (error) {
    console.error("[ia.routes] Error al obtener resumen:", error)
    res.status(500).json({ error: "No se pudo cargar el resumen." })
  }
})

// Guardar o actualizar resumen (producto, ángulo, copys, imágenes)
router.put("/resumen", requireAuth, async (req, res) => {
  try {
    const tenantId = tenantIdFromReq(req)
    if (!tenantId) {
      return res.status(400).json({ error: "No se pudo identificar el tenant." })
    }
    const { producto, angulo, copys, imagenPorCopy, mensajes } = req.body || {}
    const update = {
      producto: producto ?? null,
      angulo: angulo ?? null,
      copys: Array.isArray(copys) ? copys : [],
      imagenPorCopy:
        imagenPorCopy && typeof imagenPorCopy === "object" ? imagenPorCopy : {},
    }
    if (mensajes !== undefined) {
      update.mensajes = Array.isArray(mensajes) ? mensajes : []
    }
    const doc = await IaResumen.findOneAndUpdate(
      { tenantId },
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    )
    res.json({
      producto: doc.producto ?? null,
      angulo: doc.angulo ?? null,
      copys: Array.isArray(doc.copys) ? doc.copys : [],
      imagenPorCopy:
        doc.imagenPorCopy && typeof doc.imagenPorCopy === "object"
          ? doc.imagenPorCopy
          : {},
      mensajes: Array.isArray(doc.mensajes) ? doc.mensajes : [],
    })
  } catch (error) {
    console.error("[ia.routes] Error al guardar resumen:", error)
    res.status(500).json({ error: "No se pudo guardar el resumen." })
  }
})

// Limpiar resumen guardado
router.delete("/resumen", requireAuth, async (req, res) => {
  try {
    const tenantId = tenantIdFromReq(req)
    if (!tenantId) {
      return res.status(400).json({ error: "No se pudo identificar el tenant." })
    }
    await IaResumen.deleteOne({ tenantId })
    res.json({ ok: true, message: "Resumen eliminado." })
  } catch (error) {
    console.error("[ia.routes] Error al eliminar resumen:", error)
    res.status(500).json({ error: "No se pudo eliminar el resumen." })
  }
})

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
    const { prompt, aspectRatio = "1:1", imagenesProducto = [] } = req.body || {}

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({
        error: "Falta 'prompt' en el cuerpo para generar la imagen.",
      })
    }

    const resultado = await generarImagenDesdePrompt(prompt.trim(), aspectRatio, imagenesProducto)
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
    const { imagenDataUrl, imagenesProducto = [], contextoProducto = {}, historial = [], copyBase = null } = req.body || {}

    if (!imagenDataUrl && (!imagenesProducto || imagenesProducto.length === 0)) {
      return res.status(400).json({
        error: "Falta 'imagenDataUrl' o 'imagenesProducto' en el cuerpo de la petición.",
      })
    }

    const resultado = await generarCopyDesdeImagen(imagenDataUrl, contextoProducto, historial, imagenesProducto, copyBase)
    res.json(resultado)
  } catch (error) {
    console.error("[ia.routes] Error al generar copy desde imagen:", error)
    res
      .status(500)
      .json({ error: "No se pudo generar el copy desde la imagen con la IA." })
  }
})


// Inicia generación de video con RunwayML (image-to-video)
router.post("/generar-video-runway", requireAuth, async (req, res) => {
  try {
    const { copyTexto, imageUrl, ratio, duration } = req.body || {}

    if (!copyTexto || typeof copyTexto !== "string" || !copyTexto.trim()) {
      return res.status(400).json({ error: "Falta 'copyTexto' para generar el video con Runway." })
    }
    if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.trim()) {
      return res.status(400).json({ error: "Falta 'imageUrl' para generar el video con Runway." })
    }

    const resultado = await iniciarVideoRunway({ copyTexto, imageUrl, ratio, duration })
    res.json(resultado)
  } catch (error) {
    console.error("[ia.routes] Error al generar video con Runway:", error)
    res.status(500).json({ error: error.message || "No se pudo iniciar la generación del video con Runway." })
  }
})

// Consulta el estado de un task de RunwayML
router.get("/video-runway-estado/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    if (!id) return res.status(400).json({ error: "Falta 'id' del task de Runway." })

    const resultado = await obtenerEstadoVideoRunway(id)
    res.json(resultado)
  } catch (error) {
    console.error("[ia.routes] Error al consultar estado de video Runway:", error)
    res.status(500).json({ error: error.message || "No se pudo consultar el estado del video de Runway." })
  }
})

// Genera voz (TTS) con RunwayML
router.post("/generar-voz-runway", requireAuth, async (req, res) => {
  try {
    const { texto, voiceId } = req.body || {}
    if (!texto?.trim()) return res.status(400).json({ error: "Falta 'texto' para generar la voz." })
    const resultado = await generarVozRunway({ texto, voiceId })
    res.json(resultado)
  } catch (error) {
    console.error("[ia.routes] Error al generar voz con Runway:", error)
    res.status(500).json({ error: error.message || "No se pudo generar la voz." })
  }
})

// Consulta estado de la voz generada
router.get("/voz-runway-estado/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    if (!id) return res.status(400).json({ error: "Falta 'id' del task." })
    const resultado = await obtenerEstadoVozRunway(id)
    res.json(resultado)
  } catch (error) {
    console.error("[ia.routes] Error al consultar estado de voz Runway:", error)
    res.status(500).json({ error: error.message || "No se pudo consultar el estado de la voz." })
  }
})

export default router

