import { getCampanaModel } from "../models/campana.model.js"
import mongoose from "mongoose"
import { crearYEmitir } from "./notification.controller.js"

function toResponse(doc) {
  if (!doc) return null
  const o = doc.toObject ? doc.toObject() : doc
  return {
    id: o._id?.toString(),
    nombre: o.nombre ?? "",
    producto: o.producto ?? "",
    piezaCreativo: o.piezaCreativo ?? "",
    plataforma: o.plataforma ?? "",
    miracleCoins: o.miracleCoins ?? 0,
    estado: o.estado ?? "borrador",
    createdAt: o.createdAt,
  }
}

export async function listar(req, res) {
  try {
    const { estado, limit = 500, skip = 0 } = req.query
    const Campana = getCampanaModel(req.db)
    const filter = {}
    if (estado && ["borrador", "activa", "pausada", "finalizada"].includes(estado)) {
      filter.estado = estado
    }
    const campanas = await Campana.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit), 1000))
      .skip(Number(skip))
      .lean()
    res.json(campanas.map(toResponse))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function obtenerUno(req, res) {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID de campaña no válido" })
    }
    const Campana = getCampanaModel(req.db)
    const campana = await Campana.findById(id).lean()
    if (!campana) return res.status(404).json({ error: "Campaña no encontrada" })
    res.json(toResponse(campana))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function crear(req, res) {
  try {
    const { nombre, producto, piezaCreativo, plataforma, miracleCoins, estado } = req.body
    const Campana = getCampanaModel(req.db)
    const campana = await Campana.create({
      nombre: (nombre ?? "").trim(),
      producto: (producto ?? "").trim(),
      piezaCreativo: (piezaCreativo ?? "").trim(),
      plataforma: (plataforma ?? "").trim(),
      miracleCoins: Math.max(0, Number(miracleCoins) || 0),
      estado: ["borrador", "activa", "pausada", "finalizada"].includes(estado) ? estado : "borrador",
    })
    crearYEmitir(req.db, req.tenantDbName, {
      tipo: 'campana_creada',
      titulo: 'Nueva campaña creada',
      mensaje: `"${campana.nombre}" fue creada${campana.plataforma ? ` para ${campana.plataforma}` : ''}`,
      meta: { id: campana._id.toString(), nombre: campana.nombre, plataforma: campana.plataforma },
    })
    res.status(201).json(toResponse(campana))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function actualizar(req, res) {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID de campaña no válido" })
    }
    const { nombre, producto, piezaCreativo, plataforma, miracleCoins, estado } = req.body
    const update = {}
    if (nombre !== undefined) update.nombre = (nombre ?? "").trim()
    if (producto !== undefined) update.producto = (producto ?? "").trim()
    if (piezaCreativo !== undefined) update.piezaCreativo = (piezaCreativo ?? "").trim()
    if (plataforma !== undefined) update.plataforma = (plataforma ?? "").trim()
    if (miracleCoins !== undefined) update.miracleCoins = Math.max(0, Number(miracleCoins) || 0)
    if (estado !== undefined && ["borrador", "activa", "pausada", "finalizada"].includes(estado)) {
      update.estado = estado
    }
    const Campana = getCampanaModel(req.db)
    const campana = await Campana.findByIdAndUpdate(id, update, { new: true }).lean()
    if (!campana) return res.status(404).json({ error: "Campaña no encontrada" })
    res.json(toResponse(campana))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function eliminar(req, res) {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID de campaña no válido" })
    }
    const Campana = getCampanaModel(req.db)
    const campana = await Campana.findByIdAndDelete(id)
    if (!campana) return res.status(404).json({ error: "Campaña no encontrada" })
    res.status(204).end()
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function actualizarEstado(req, res) {
  try {
    const { id } = req.params
    const { estado } = req.body
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID de campaña no válido" })
    }
    if (!["borrador", "activa", "pausada", "finalizada"].includes(estado)) {
      return res.status(400).json({ error: "Estado no válido" })
    }
    const Campana = getCampanaModel(req.db)
    const campana = await Campana.findByIdAndUpdate(id, { estado }, { new: true }).lean()
    if (!campana) return res.status(404).json({ error: "Campaña no encontrada" })
    const estadoLabel = { activa: 'activada', pausada: 'pausada', finalizada: 'finalizada', borrador: 'guardada como borrador' }
    crearYEmitir(req.db, req.tenantDbName, {
      tipo: 'campana_estado',
      titulo: 'Estado de campaña actualizado',
      mensaje: `"${campana.nombre}" está ahora ${estadoLabel[estado] || estado}`,
      meta: { id: id, nombre: campana.nombre, estado },
    })
    res.json(toResponse(campana))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
