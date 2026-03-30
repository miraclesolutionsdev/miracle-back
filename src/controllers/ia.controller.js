import {
  generarAngulosParaProducto,
  generarCopysParaProducto,
  generarGuionDesdeImagen,
  generarCopyDesdeImagen,
} from "../services/iaCopy.service.js"
import { generarImagenDesdePrompt } from "../services/iaImagen.service.js"
import {
  iniciarVideoRunway,
  obtenerEstadoVideoRunway,
  generarVozRunway,
  obtenerEstadoVozRunway,
} from "../services/iaVideo.service.js"

export async function generarAngulos(req, res) {
  try {
    const { producto, historial = [] } = req.body
    if (!producto?.nombre) {
      return res.status(400).json({ error: "Faltan datos del producto. Se requiere al menos 'nombre'." })
    }
    const resultado = await generarAngulosParaProducto(producto, historial)
    res.json(resultado)
  } catch (error) {
    res.status(500).json({ error: "No se pudieron generar los ángulos con la IA." })
  }
}

export async function generarCopys(req, res) {
  try {
    const { producto, angulo, historial = [] } = req.body
    if (!producto?.nombre) {
      return res.status(400).json({ error: "Faltan datos del producto. Se requiere al menos 'nombre'." })
    }
    if (!angulo?.nombre) {
      return res.status(400).json({ error: "Faltan datos del ángulo. Se requiere al menos 'nombre'." })
    }
    const resultado = await generarCopysParaProducto(producto, angulo, historial)
    res.json(resultado)
  } catch (error) {
    res.status(500).json({ error: "No se pudieron generar los copys con la IA." })
  }
}

export async function generarGuionImagen(req, res) {
  try {
    const { payload, historial = [] } = req.body
    if (!payload?.producto || !payload?.copy_base || !payload?.imagen) {
      return res.status(400).json({
        error: "Faltan datos para generar el guion. Se requiere 'producto', 'copy_base' e 'imagen'.",
      })
    }
    const resultado = await generarGuionDesdeImagen(payload, historial)
    res.json(resultado)
  } catch (error) {
    res.status(500).json({ error: "No se pudo generar el guion desde la imagen con la IA." })
  }
}

export async function generarImagen(req, res) {
  try {
    const { prompt, aspectRatio = "1:1", imagenesProducto = [] } = req.body || {}
    if (!prompt?.trim()) {
      return res.status(400).json({ error: "Falta 'prompt' para generar la imagen." })
    }
    const resultado = await generarImagenDesdePrompt(prompt.trim(), aspectRatio, imagenesProducto)
    res.json(resultado)
  } catch (error) {
    res.status(500).json({ error: error.message || "No se pudo generar la imagen con la IA." })
  }
}

export async function generarCopyImagen(req, res) {
  try {
    const {
      imagenDataUrl,
      imagenesProducto = [],
      contextoProducto = {},
      historial = [],
      copyBase = null,
    } = req.body || {}
    if (!imagenDataUrl && (!imagenesProducto || imagenesProducto.length === 0)) {
      return res.status(400).json({
        error: "Falta 'imagenDataUrl' o 'imagenesProducto' en el cuerpo de la petición.",
      })
    }
    const resultado = await generarCopyDesdeImagen(imagenDataUrl, contextoProducto, historial, imagenesProducto, copyBase)
    res.json(resultado)
  } catch (error) {
    res.status(500).json({ error: "No se pudo generar el copy desde la imagen con la IA." })
  }
}

export async function iniciarVideo(req, res) {
  try {
    const { copyTexto, imageUrl, ratio, duration } = req.body || {}
    if (!copyTexto?.trim()) {
      return res.status(400).json({ error: "Falta 'copyTexto' para generar el video con Runway." })
    }
    if (!imageUrl?.trim()) {
      return res.status(400).json({ error: "Falta 'imageUrl' para generar el video con Runway." })
    }
    const resultado = await iniciarVideoRunway({ copyTexto, imageUrl, ratio, duration })
    res.json(resultado)
  } catch (error) {
    res.status(500).json({ error: error.message || "No se pudo iniciar la generación del video." })
  }
}

export async function obtenerEstadoVideo(req, res) {
  try {
    const { id } = req.params
    if (!id) return res.status(400).json({ error: "Falta 'id' del task de Runway." })
    const resultado = await obtenerEstadoVideoRunway(id)
    res.json(resultado)
  } catch (error) {
    res.status(500).json({ error: error.message || "No se pudo consultar el estado del video." })
  }
}

export async function iniciarVoz(req, res) {
  try {
    const { texto, voiceId } = req.body || {}
    if (!texto?.trim()) return res.status(400).json({ error: "Falta 'texto' para generar la voz." })
    const resultado = await generarVozRunway({ texto, voiceId })
    res.json(resultado)
  } catch (error) {
    res.status(500).json({ error: error.message || "No se pudo generar la voz." })
  }
}

export async function obtenerEstadoVoz(req, res) {
  try {
    const { id } = req.params
    if (!id) return res.status(400).json({ error: "Falta 'id' del task." })
    const resultado = await obtenerEstadoVozRunway(id)
    res.json(resultado)
  } catch (error) {
    res.status(500).json({ error: error.message || "No se pudo consultar el estado de la voz." })
  }
}
