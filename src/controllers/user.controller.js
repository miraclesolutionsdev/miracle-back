import User from "../models/user.model.js"
import bcrypt from "bcrypt"
import mongoose from "mongoose"

const SALT_ROUNDS = 10

function toSafeUser(doc, effectiveOriginal = null) {
  if (!doc) return null
  const o = doc.toObject ? doc.toObject() : doc
  const isOriginal = effectiveOriginal !== null ? effectiveOriginal : o.isOriginalAdmin === true
  return {
    id: o._id?.toString(),
    email: o.email,
    nombre: o.nombre ?? "",
    activo: o.activo !== false,
    isOriginalAdmin: isOriginal,
  }
}

/** True si el usuario es el administrador original del tenant (el primero creado o el marcado en BD). */
async function isOriginalAdmin(tenantId, userId) {
  const users = await User.find({ tenantId }).select("_id isOriginalAdmin").sort({ createdAt: 1 }).lean()
  if (!users.length) return false
  const targetId = userId.toString ? userId.toString() : String(userId)
  const target = users.find((u) => u._id.toString() === targetId)
  if (!target) return false
  if (target.isOriginalAdmin === true) return true
  const hasAnyOriginal = users.some((u) => u.isOriginalAdmin === true)
  if (hasAnyOriginal) return false
  return users[0]._id.toString() === targetId
}

export async function listar(req, res) {
  try {
    const tenantId = req.tenantId
    if (!tenantId) return res.status(401).json({ error: "No autorizado" })
    const users = await User.find({ tenantId })
      .select("-password")
      .sort({ createdAt: 1 })
      .lean()
    const hasAnyOriginal = users.some((u) => u.isOriginalAdmin === true)
    const firstId = users[0]?._id?.toString()
    res.json(
      users.map((u) => {
        const effectiveOriginal =
          u.isOriginalAdmin === true || (!hasAnyOriginal && u._id.toString() === firstId)
        return toSafeUser(u, effectiveOriginal)
      })
    )
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
    const count = await User.countDocuments({ tenantId })
    const hash = await bcrypt.hash(password, SALT_ROUNDS)
    const user = await User.create({
      email: emailNorm,
      password: hash,
      nombre: (nombre || "").trim(),
      tenantId,
      activo: true,
      isOriginalAdmin: count === 0,
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
    const { activo, email, nombre, contraseñaActual, nuevaContraseña } = req.body
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID de usuario no válido" })
    }
    const user = await User.findOne({ _id: id, tenantId })
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" })

    const update = {}
    const original = await isOriginalAdmin(tenantId, id)

    if (typeof activo === "boolean" && !original) {
      update.activo = activo
    } else if (typeof activo === "boolean" && original) {
      return res.status(403).json({ error: "No se puede deshabilitar al administrador original" })
    }

    if (email !== undefined) {
      const emailNorm = (email ?? "").trim().toLowerCase()
      if (!emailNorm) return res.status(400).json({ error: "El email es obligatorio" })
      const exists = await User.findOne({
        email: emailNorm,
        tenantId,
        _id: { $ne: id },
      })
      if (exists) return res.status(409).json({ error: "Ya existe un usuario con ese email en esta tienda" })
      update.email = emailNorm
    }
    if (nombre !== undefined) update.nombre = (nombre ?? "").trim()

    if (contraseñaActual !== undefined && nuevaContraseña !== undefined) {
      if (!nuevaContraseña || nuevaContraseña.length < 6) {
        return res.status(400).json({ error: "La nueva contraseña debe tener al menos 6 caracteres" })
      }
      const userWithPass = await User.findById(id).select("+password")
      if (!userWithPass) return res.status(404).json({ error: "Usuario no encontrado" })
      const ok = await bcrypt.compare(contraseñaActual, userWithPass.password)
      if (!ok) return res.status(401).json({ error: "Contraseña actual incorrecta" })
      update.password = await bcrypt.hash(nuevaContraseña, SALT_ROUNDS)
    } else if (contraseñaActual || nuevaContraseña) {
      return res.status(400).json({ error: "Para cambiar la contraseña debes indicar la actual y la nueva" })
    }

    const updated = await User.findOneAndUpdate(
      { _id: id, tenantId },
      update,
      { new: true }
    )
      .select("-password")
      .lean()
    res.json(toSafeUser(updated, original))
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
    const original = await isOriginalAdmin(tenantId, id)
    if (original) {
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
