import Cliente from "../models/cliente.model.js"
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
    fechaCreacion: o.createdAt,
  }
}

export async function listarTodos(req, res) {
  try {
    const clientes = await Cliente.find({}).sort({ createdAt: -1 })
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
    const cliente = await Cliente.findById(id)
    if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" })
    res.json(toClienteResponse(cliente))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function crear(req, res) {
  try {
    const { nombreEmpresa, cedulaNit, email, whatsapp, direccion, ciudadBarrio } = req.body
    const nom = (nombreEmpresa || "").trim()
    const ced = (cedulaNit ?? "").trim()
    const em = (email || "").trim()
    const wa = (whatsapp ?? "").trim()
    const dir = (direccion ?? "").trim()
    const ciu = (ciudadBarrio ?? "").trim()
    if (!nom || !ced || !em || !wa || !dir || !ciu) {
      return res.status(400).json({
        error: "Todos los campos son obligatorios: nombreEmpresa, cedulaNit, email, whatsapp, direccion, ciudadBarrio",
      })
    }
    const cliente = await Cliente.create({
      nombreEmpresa: nom,
      cedulaNit: ced,
      email: em,
      whatsapp: wa,
      direccion: dir,
      ciudadBarrio: ciu,
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
    const { nombreEmpresa, cedulaNit, email, whatsapp, direccion, ciudadBarrio } = req.body
    const update = {}
    if (nombreEmpresa !== undefined) update.nombreEmpresa = nombreEmpresa
    if (cedulaNit !== undefined) update.cedulaNit = cedulaNit
    if (email !== undefined) update.email = email
    if (whatsapp !== undefined) update.whatsapp = whatsapp
    if (direccion !== undefined) update.direccion = direccion
    if (ciudadBarrio !== undefined) update.ciudadBarrio = ciudadBarrio

    const cliente = await Cliente.findByIdAndUpdate(id, update, { new: true })
    if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" })
    res.json(toClienteResponse(cliente))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
