import { getClienteModel } from "../models/cliente.model.js"
import mongoose from "mongoose"

function toClienteResponse(doc) {
  if (!doc) return null
  const o = doc.toObject ? doc.toObject() : doc
  return {
    id: o._id?.toString(),
    nombreEmpresa: o.nombreEmpresa,
    cedulaNit: o.cedulaNit,
    email: o.email,
    whatsapp: o.whatsapp,
    direccion: o.direccion,
    ciudadBarrio: o.ciudadBarrio,
    estado: o.estado,
    miracleCoins: o.miracleCoins ?? 0,
    fechaCreacion: o.createdAt,
  }
}

export async function listarTodos(req, res) {
  try {
    const { estado, limit = 500, skip = 0 } = req.query
    const Cliente = getClienteModel(req.db)
    const filter = {}
    if (estado) filter.estado = estado
    const clientes = await Cliente.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit), 1000))
      .skip(Number(skip))
      .lean()
    res.json(clientes.map(toClienteResponse))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function obtenerUno(req, res) {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID de cliente no válido" })
    }
    const Cliente = getClienteModel(req.db)
    const cliente = await Cliente.findById(id)
    if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" })
    res.json(toClienteResponse(cliente))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function crear(req, res) {
  try {
    const { nombreEmpresa, cedulaNit, email, whatsapp, direccion, ciudadBarrio, estado, miracleCoins } = req.body
    if (!nombreEmpresa || !email) {
      return res.status(400).json({ error: "Faltan campos requeridos: nombreEmpresa, email" })
    }
    const Cliente = getClienteModel(req.db)
    const cliente = await Cliente.create({
      nombreEmpresa,
      cedulaNit: cedulaNit ?? "",
      email,
      whatsapp: whatsapp ?? "",
      direccion: direccion ?? "",
      ciudadBarrio: ciudadBarrio ?? "",
      estado: estado === "pausado" || estado === "inactivo" ? estado : "activo",
      miracleCoins: Math.max(0, Number(miracleCoins) || 0),
    })
    res.status(201).json(toClienteResponse(cliente))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function actualizar(req, res) {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID de cliente no válido" })
    }
    const { nombreEmpresa, cedulaNit, email, whatsapp, direccion, ciudadBarrio, estado, miracleCoins } = req.body
    const update = {}
    if (nombreEmpresa !== undefined) update.nombreEmpresa = nombreEmpresa
    if (cedulaNit !== undefined) update.cedulaNit = cedulaNit
    if (email !== undefined) update.email = email
    if (whatsapp !== undefined) update.whatsapp = whatsapp
    if (direccion !== undefined) update.direccion = direccion
    if (ciudadBarrio !== undefined) update.ciudadBarrio = ciudadBarrio
    if (estado !== undefined && ["activo", "pausado", "inactivo"].includes(estado)) update.estado = estado
    if (miracleCoins !== undefined) update.miracleCoins = Math.max(0, Number(miracleCoins) || 0)
    const Cliente = getClienteModel(req.db)
    const cliente = await Cliente.findByIdAndUpdate(id, update, { new: true })
    if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" })
    res.json(toClienteResponse(cliente))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
