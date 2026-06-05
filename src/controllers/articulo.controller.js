import { getArticuloModel } from "../models/articulo.model.js"
import mongoose from "mongoose"
import { subirImagen } from "../services/s3.service.js"
import { toArticuloResponse } from "../utils/responseFormatters.js"

export async function listarTodos(req, res) {
  try {
    const Articulo = getArticuloModel(req.db)
    const { categoria, estado, limit = 50, skip = 0 } = req.query

    const filter = {}
    // Sin auth solo se ven publicados; con auth se pueden filtrar por estado
    if (req.user) {
      if (estado) filter.estado = estado
    } else {
      filter.estado = "publicado"
    }
    if (categoria) filter.categoria = categoria

    const articulos = await Articulo.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit), 200))
      .skip(Number(skip))
      .lean()

    res.json(articulos.map(toArticuloResponse))
  } catch (err) {
    res.status(500).json({ error: "Error al listar artículos", detalle: err.message })
  }
}

export async function obtenerUno(req, res) {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ error: "ID inválido" })

    const Articulo = getArticuloModel(req.db)
    const articulo = await Articulo.findById(id).lean()
    if (!articulo) return res.status(404).json({ error: "Artículo no encontrado" })

    // Sin auth, solo se puede ver si está publicado
    if (!req.user && articulo.estado !== "publicado")
      return res.status(404).json({ error: "Artículo no encontrado" })

    res.json(toArticuloResponse(articulo))
  } catch (err) {
    res.status(500).json({ error: "Error al obtener artículo", detalle: err.message })
  }
}

export async function crear(req, res) {
  try {
    const Articulo = getArticuloModel(req.db)
    const { titulo, extracto, contenido, categoria, etiquetas, estado } = req.body

    if (!titulo?.trim()) return res.status(400).json({ error: "El título es obligatorio" })

    let imagenUrl = ""
    let imagenContentType = "image/jpeg"

    if (req.file) {
      const key = `${req.tenantSlug}/articulos/${Date.now()}-${req.file.originalname.replace(/[^a-z0-9._-]/gi, "_")}`
      imagenUrl = await subirImagen(req.file.buffer, req.file.mimetype, key)
      imagenContentType = req.file.mimetype
    }

    const etiquetasArr = Array.isArray(etiquetas)
      ? etiquetas
      : typeof etiquetas === "string"
      ? etiquetas.split(",").map((t) => t.trim()).filter(Boolean)
      : []

    const articulo = await Articulo.create({
      titulo: titulo.trim(),
      extracto: extracto?.trim() ?? "",
      contenido: contenido ?? "",
      imagenUrl,
      imagenContentType,
      categoria: categoria?.trim() ?? "",
      etiquetas: etiquetasArr,
      estado: estado ?? "borrador",
    })

    res.status(201).json(toArticuloResponse(articulo))
  } catch (err) {
    res.status(500).json({ error: "Error al crear artículo", detalle: err.message })
  }
}

export async function actualizar(req, res) {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ error: "ID inválido" })

    const Articulo = getArticuloModel(req.db)
    const articulo = await Articulo.findById(id)
    if (!articulo) return res.status(404).json({ error: "Artículo no encontrado" })

    const { titulo, extracto, contenido, categoria, etiquetas, estado } = req.body

    if (titulo !== undefined) articulo.titulo = titulo.trim()
    if (extracto !== undefined) articulo.extracto = extracto.trim()
    if (contenido !== undefined) articulo.contenido = contenido
    if (categoria !== undefined) articulo.categoria = categoria.trim()
    if (estado !== undefined) articulo.estado = estado

    if (etiquetas !== undefined) {
      articulo.etiquetas = Array.isArray(etiquetas)
        ? etiquetas
        : typeof etiquetas === "string"
        ? etiquetas.split(",").map((t) => t.trim()).filter(Boolean)
        : []
    }

    if (req.file) {
      const key = `${req.tenantSlug}/articulos/${Date.now()}-${req.file.originalname.replace(/[^a-z0-9._-]/gi, "_")}`
      articulo.imagenUrl = await subirImagen(req.file.buffer, req.file.mimetype, key)
      articulo.imagenContentType = req.file.mimetype
    }

    await articulo.save()
    res.json(toArticuloResponse(articulo))
  } catch (err) {
    res.status(500).json({ error: "Error al actualizar artículo", detalle: err.message })
  }
}

export async function eliminar(req, res) {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ error: "ID inválido" })

    const Articulo = getArticuloModel(req.db)
    const articulo = await Articulo.findByIdAndDelete(id)
    if (!articulo) return res.status(404).json({ error: "Artículo no encontrado" })

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar artículo", detalle: err.message })
  }
}
