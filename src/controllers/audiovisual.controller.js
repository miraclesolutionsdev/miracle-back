import PiezaAudiovisual from "../models/piezaAudiovisual.model.js"
import mongoose from "mongoose"
import {
  subirArchivoAudiovisualEvitandoDuplicado,
  obtenerPresignedPutAudiovisual,
} from "../services/s3.service.js"

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
    const tenantId = req.tenantId
    if (!tenantId) return res.status(401).json({ error: "No autorizado" })
    const { estado, tipo } = req.query
    const filter = { $or: [{ tenantId }, { tenantId: null }, { tenantId: { $exists: false } }] }
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
    const tenantId = req.tenantId
    if (!tenantId) return res.status(401).json({ error: "No autorizado" })
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
      tenantId: req.tenantId,
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

export async function obtenerPresignedUrl(req, res) {
  try {
    const { filename, contentType } = req.body
    const name = (filename || "").trim() || "archivo"
    const type = (contentType || "").trim() || "application/octet-stream"
    const { uploadUrl, key, publicUrl } = await obtenerPresignedPutAudiovisual(name, type)
    res.json({ uploadUrl, key, publicUrl })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function confirmarSubida(req, res) {
  try {
    const { tipo, plataforma, resolucion, duracion, campanaAsociada, key, publicUrl, contentType } = req.body
    if (!tipo || !plataforma) {
      return res.status(400).json({ error: "Faltan campos: tipo, plataforma" })
    }
    if (!publicUrl && !key) {
      return res.status(400).json({ error: "Falta publicUrl o key del archivo en S3" })
    }
    const formato =
      tipo === "Video" && resolucion && (duracion != null && duracion !== "")
        ? `${resolucion} · ${duracion}s`
        : (resolucion || "").trim()
    const tenantId = req.tenantId
    if (!tenantId) return res.status(401).json({ error: "No autorizado" })
    const pieza = await PiezaAudiovisual.create({
      tenantId,
      tipo: tipo === "Imagen" ? "Imagen" : "Video",
      plataforma: (plataforma || "").trim(),
      formato,
      estado: "pendiente",
      campanaAsociada: (campanaAsociada || "").trim(),
      url: (publicUrl || "").trim() || key,
      contentType: (contentType || "").trim() || "application/octet-stream",
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

    const tenantId = req.tenantId
    if (!tenantId) return res.status(401).json({ error: "No autorizado" })
    const pieza = await PiezaAudiovisual.findOneAndUpdate(
      {
        _id: id,
        $or: [{ tenantId }, { tenantId: null }, { tenantId: { $exists: false } }],
      },
      { estado },
      { new: true }
    )

    if (!pieza) return res.status(404).json({ error: "Pieza no encontrada" })
    res.json(toResponse(pieza))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
