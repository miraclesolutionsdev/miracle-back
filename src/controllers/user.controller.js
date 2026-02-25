import User from "../models/user.model.js"
import bcrypt from "bcrypt"
import mongoose from "mongoose"

const SALT_ROUNDS = 10

function toSafeUser(doc) {
  if (!doc) return null
  const o = doc.toObject ? doc.toObject() : doc
  return {
    id: o._id?.toString(),
    email: o.email,
    nombre: o.nombre ?? "",
    activo: o.activo !== false,
    isOriginalAdmin: o.isOriginalAdmin === true,
  }
}

export async function listar(req, res) {
  try {
    const tenantId = req.tenantId
    if (!tenantId) return res.status(401).json({ error: "No autorizado" })
    const users = await User.find({ tenantId })
      .select("-password")
      .sort({ createdAt: 1 })
      .lean()
    res.json(users.map(toSafeUser))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function crear(req, res) {
  try {
    const tenantId = req.tenantId
    if (!tenantId) return res.status(401).json({ error: "No autorizado" })
    const { email, password, nombre } = req.body
    const emailNorm = (email || "").trim().toLowerCase()
    if (!emailNorm || !password) {
      return res.status(400).json({ error: "Email y contraseña son obligatorios" })
    }
    const exists = await User.findOne({ email: emailNorm, tenantId })
    if (exists) {
      return res.status(409).json({ error: "Ya existe un usuario con ese email en esta tienda" })
    }
    const hash = await bcrypt.hash(password, SALT_ROUNDS)
    const user = await User.create({
      email: emailNorm,
      password: hash,
      nombre: (nombre || "").trim(),
      tenantId,
      activo: true,
      isOriginalAdmin: false,
    })
    res.status(201).json(toSafeUser(user))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function actualizar(req, res) {
  try {
    const tenantId = req.tenantId
    if (!tenantId) return res.status(401).json({ error: "No autorizado" })
    const { id } = req.params
    const { activo } = req.body
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID de usuario no válido" })
    }
    const user = await User.findOne({ _id: id, tenantId }).lean()
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" })
    if (user.isOriginalAdmin) {
      return res.status(403).json({ error: "No se puede deshabilitar al administrador original" })
    }
    const updated = await User.findOneAndUpdate(
      { _id: id, tenantId },
      { activo: !!activo },
      { new: true }
    )
      .select("-password")
      .lean()
    res.json(toSafeUser(updated))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function eliminar(req, res) {
  try {
    const tenantId = req.tenantId
    const userId = req.userId
    if (!tenantId) return res.status(401).json({ error: "No autorizado" })
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID de usuario no válido" })
    }
    const user = await User.findOne({ _id: id, tenantId }).lean()
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" })
    if (user.isOriginalAdmin) {
      return res.status(403).json({ error: "No se puede eliminar al administrador original" })
    }
    if (user._id.toString() === userId) {
      return res.status(403).json({ error: "No puedes eliminarte a ti mismo" })
    }
    await User.deleteOne({ _id: id, tenantId })
    res.status(204).send()
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
