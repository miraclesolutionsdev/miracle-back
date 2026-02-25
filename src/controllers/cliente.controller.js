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
    origen: o.origen || "plataforma",
    productoInteres: o.productoInteres || "",
    notas: o.notas || "",
    fechaCreacion: o.createdAt,
  }
}

export async function listarTodos(req, res) {
  try {
    const tenantId = req.tenantId
    if (!tenantId) return res.status(401).json({ error: "No autorizado" })
    const { origen, ciudad, busqueda, fechaDesde, fechaHasta } = req.query
    const filter = { $or: [{ tenantId: tenantId }, { tenantId: null }, { tenantId: { $exists: false } }] }

    if (origen && ["plataforma", "whatsapp"].includes(String(origen).toLowerCase())) {
      filter.origen = String(origen).toLowerCase()
    }
    if (ciudad && String(ciudad).trim()) {
      filter.ciudadBarrio = new RegExp(String(ciudad).trim(), "i")
    }
    if (busqueda && String(busqueda).trim()) {
      const q = String(busqueda).trim()
      filter.$or = [
        { nombreEmpresa: new RegExp(q, "i") },
        { cedulaNit: new RegExp(q, "i") },
        { email: new RegExp(q, "i") },
        { whatsapp: new RegExp(q, "i") },
        { ciudadBarrio: new RegExp(q, "i") },
        { productoInteres: new RegExp(q, "i") },
      ]
    }
    if (fechaDesde || fechaHasta) {
      filter.createdAt = {}
      if (fechaDesde) {
        const d = new Date(fechaDesde)
        if (!Number.isNaN(d.getTime())) filter.createdAt.$gte = d
      }
      if (fechaHasta) {
        const d = new Date(fechaHasta)
        if (!Number.isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999)
          filter.createdAt.$lte = d
        }
      }
      if (Object.keys(filter.createdAt).length === 0) delete filter.createdAt
    }

    const clientes = await Cliente.find(filter).sort({ createdAt: -1 }).lean()
    res.json(clientes.map(toClienteResponse))
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
      return res.status(400).json({ error: "ID de cliente no válido" })
    }
    const cliente = await Cliente.findOne({
      _id: id,
      $or: [{ tenantId }, { tenantId: null }, { tenantId: { $exists: false } }],
    })
    if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" })
    res.json(toClienteResponse(cliente))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function crear(req, res) {
  try {
    const tenantId = req.tenantId
    if (!tenantId) return res.status(401).json({ error: "No autorizado" })
    const {
      nombreEmpresa,
      nombre,
      cedulaNit,
      email,
      whatsapp,
      telefono,
      direccion,
      ciudadBarrio,
      origen,
      productoInteres,
      notas,
    } = req.body

    const origenValido = ["plataforma", "whatsapp"].includes(String(origen || "").toLowerCase())
      ? String(origen).toLowerCase()
      : "plataforma"

    if (origenValido === "whatsapp") {
      const nom = (nombreEmpresa || nombre || "").trim()
      const wa = (whatsapp ?? telefono ?? "").trim()
      if (!nom || !wa) {
        return res.status(400).json({
          error: "Para origen WhatsApp son obligatorios: nombre (o nombreEmpresa) y telefono (o whatsapp)",
        })
      }
      const tenantId = req.tenantId
      if (!tenantId) return res.status(401).json({ error: "No autorizado" })
      const cliente = await Cliente.create({
        tenantId,
        nombreEmpresa: nom,
        cedulaNit: (cedulaNit ?? "").trim(),
        email: (email ?? "").trim(),
        whatsapp: wa,
        direccion: (direccion ?? "").trim(),
        ciudadBarrio: (ciudadBarrio ?? "").trim(),
        origen: "whatsapp",
        productoInteres: (productoInteres ?? "").trim(),
        notas: (notas ?? "").trim(),
      })
      return res.status(201).json(toClienteResponse(cliente))
    }

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
    const existente = await Cliente.findOne({ cedulaNit: ced, tenantId })
    if (existente) {
      return res.status(409).json({
        error: "Ya existe un cliente con esta cédula/NIT.",
      })
    }
    const cliente = await Cliente.create({
      tenantId,
      nombreEmpresa: nom,
      cedulaNit: ced,
      email: em,
      whatsapp: wa,
      direccion: dir,
      ciudadBarrio: ciu,
      origen: "plataforma",
      productoInteres: (productoInteres ?? "").trim(),
      notas: (notas ?? "").trim(),
    })
    res.status(201).json(toClienteResponse(cliente))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function actualizar(req, res) {
  try {
    if (!req.tenantId) return res.status(401).json({ error: "No autorizado" })
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID de cliente no válido" })
    }
    const { nombreEmpresa, cedulaNit, email, whatsapp, direccion, ciudadBarrio } = req.body
    const update = {}
    if (nombreEmpresa !== undefined) update.nombreEmpresa = nombreEmpresa
    if (cedulaNit !== undefined) update.cedulaNit = (cedulaNit ?? "").trim()
    if (email !== undefined) update.email = email
    if (whatsapp !== undefined) update.whatsapp = whatsapp
    if (direccion !== undefined) update.direccion = direccion
    if (ciudadBarrio !== undefined) update.ciudadBarrio = ciudadBarrio
    if (req.body.productoInteres !== undefined) update.productoInteres = (req.body.productoInteres ?? "").trim()
    if (req.body.notas !== undefined) update.notas = (req.body.notas ?? "").trim()

    if (update.cedulaNit !== undefined) {
      const otro = await Cliente.findOne({
        cedulaNit: update.cedulaNit,
        tenantId: req.tenantId,
        _id: { $ne: id },
      })
      if (otro) {
        return res.status(409).json({
          error: "Ya existe un cliente con esta cédula/NIT.",
        })
      }
    }

    const cliente = await Cliente.findOneAndUpdate(
      { _id: id, $or: [{ tenantId: req.tenantId }, { tenantId: null }, { tenantId: { $exists: false } }] },
      update,
      { new: true }
    )
    if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" })
    res.json(toClienteResponse(cliente))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
