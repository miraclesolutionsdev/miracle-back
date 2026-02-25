import Campana from "../models/campana.model.js"
import mongoose from "mongoose"

function toResponse(doc) {
  if (!doc) return null
  const o = doc.toObject ? doc.toObject() : doc
  return {
    id: o._id?.toString(),
    producto: o.producto ?? "",
    piezaCreativo: o.piezaCreativo ?? "",
    plataforma: o.plataforma ?? "",
    miracleCoins: o.miracleCoins ?? "",
    estado: o.estado ?? "borrador",
  }
}

export async function listar(req, res) {
  try {
    const tenantId = req.tenantId
    if (!tenantId) return res.status(401).json({ error: "No autorizado" })
    const { estado } = req.query
    const filter = { tenantId }
    if (estado && ["borrador", "activa", "pausada", "finalizada"].includes(estado)) {
      filter.estado = estado
    }
    const campanas = await Campana.find(filter).sort({ createdAt: -1 }).lean()
    res.json(campanas.map(toResponse))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function obtenerUno(req, res) {
  try {
    const tenantId = req.tenantId
    if (!tenantId) return res.status(401).json({ error: "No autorizado" })
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID de campaña no válido" })
    }
    const campana = await Campana.findOne({ _id: id, tenantId }).lean()
    if (!campana) return res.status(404).json({ error: "Campaña no encontrada" })
    res.json(toResponse(campana))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function crear(req, res) {
  try {
    const tenantId = req.tenantId
    if (!tenantId) return res.status(401).json({ error: "No autorizado" })
    const { producto, piezaCreativo, plataforma, miracleCoins, estado } = req.body
    const campana = await Campana.create({
      tenantId,
      producto: (producto ?? "").trim(),
      piezaCreativo: (piezaCreativo ?? "").trim(),
      plataforma: (plataforma ?? "").trim(),
      miracleCoins: (miracleCoins ?? "").trim(),
      estado: ["borrador", "activa", "pausada", "finalizada"].includes(estado) ? estado : "borrador",
    })
    res.status(201).json(toResponse(campana))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function actualizar(req, res) {
  try {
    const tenantId = req.tenantId
    if (!tenantId) return res.status(401).json({ error: "No autorizado" })
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID de campaña no válido" })
    }
    const { producto, piezaCreativo, plataforma, miracleCoins, estado } = req.body
    const update = {}
    if (producto !== undefined) update.producto = (producto ?? "").trim()
    if (piezaCreativo !== undefined) update.piezaCreativo = (piezaCreativo ?? "").trim()
    if (plataforma !== undefined) update.plataforma = (plataforma ?? "").trim()
    if (miracleCoins !== undefined) update.miracleCoins = (miracleCoins ?? "").trim()
    if (estado !== undefined && ["borrador", "activa", "pausada", "finalizada"].includes(estado)) {
      update.estado = estado
    }
    const campana = await Campana.findOneAndUpdate(
      { _id: id, tenantId },
      update,
      { new: true }
    ).lean()
    if (!campana) return res.status(404).json({ error: "Campaña no encontrada" })
    res.json(toResponse(campana))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function actualizarEstado(req, res) {
  try {
    const tenantId = req.tenantId
    if (!tenantId) return res.status(401).json({ error: "No autorizado" })
    const { id } = req.params
    const { estado } = req.body
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID de campaña no válido" })
    }
    if (!["borrador", "activa", "pausada", "finalizada"].includes(estado)) {
      return res.status(400).json({ error: "Estado no válido" })
    }
    const campana = await Campana.findOneAndUpdate(
      { _id: id, tenantId },
      { estado },
      { new: true }
    ).lean()
    if (!campana) return res.status(404).json({ error: "Campaña no encontrada" })
    res.json(toResponse(campana))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
