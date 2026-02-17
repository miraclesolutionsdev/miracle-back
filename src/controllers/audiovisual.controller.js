import PiezaAudiovisual from "../models/piezaAudiovisual.model.js"
import mongoose from "mongoose"
import { subirArchivoAudiovisualEvitandoDuplicado } from "../services/s3.service.js"

function toResponse(doc) {
  if (!doc) return null
  const o = doc.toObject ? doc.toObject() : doc
  return {
    id: o._id?.toString(),
    tipo: o.tipo,
    plataforma: o.plataforma,
    formato: o.formato ?? "",
    estado: o.estado ?? "pendiente",
    campanaAsociada: o.campanaAsociada ?? "",
    url: o.url,
    contentType: o.contentType,
    fechaCreacion: o.createdAt,
  }
}

export async function listar(req, res) {
  try {
    const { estado, tipo } = req.query
    const filter = {}
    if (estado) filter.estado = estado
    if (tipo) filter.tipo = tipo
    const piezas = await PiezaAudiovisual.find(filter).sort({ createdAt: -1 })
    res.json(piezas.map(toResponse))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function crear(req, res) {
  try {
    const { tipo, plataforma, resolucion, duracion, campanaAsociada } = req.body
    const file = req.file

    if (!tipo || !plataforma) {
      return res.status(400).json({ error: "Faltan campos: tipo, plataforma" })
    }

    if (!file || !file.buffer) {
      return res.status(400).json({ error: "Debe adjuntar un archivo (video o imagen)" })
    }

    const formato =
      tipo === "Video" && resolucion && duracion
        ? `${resolucion} · ${duracion}`
        : resolucion ?? ""

    const url = await subirArchivoAudiovisualEvitandoDuplicado(
      file.buffer,
      file.mimetype,
      file.originalname || "archivo"
    )

    const pieza = await PiezaAudiovisual.create({
      tipo: tipo === "Imagen" ? "Imagen" : "Video",
      plataforma: (plataforma || "").trim(),
      formato: (formato || "").trim(),
      estado: "pendiente",
      campanaAsociada: (campanaAsociada || "").trim(),
      url,
      contentType: file.mimetype || "application/octet-stream",
    })

    res.status(201).json(toResponse(pieza))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function actualizarEstado(req, res) {
  try {
    const { id } = req.params
    const { estado } = req.body

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID no válido" })
    }

    if (!["pendiente", "aprobada", "usada"].includes(estado)) {
      return res.status(400).json({ error: "Estado no válido" })
    }

    const pieza = await PiezaAudiovisual.findByIdAndUpdate(
      id,
      { estado },
      { new: true }
    )

    if (!pieza) return res.status(404).json({ error: "Pieza no encontrada" })
    res.json(toResponse(pieza))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
