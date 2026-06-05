import { getUserModel } from "../models/user.model.js"
import { resolveIsOriginalAdmin, hashPassword, verificarPassword } from "../services/auth.service.js"
import mongoose from "mongoose"

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

export async function listar(req, res) {
  try {
    const User = getUserModel(req.db)
    const users = await User.find({}).select("-password").sort({ createdAt: 1 }).lean()
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
    console.error("[Users]", error.message)
    res.status(500).json({ error: "Error interno del servidor" })
  }
}

export async function crear(req, res) {
  try {
    const { email, password, nombre } = req.body
    const emailNorm = (email || "").trim().toLowerCase()
    if (!emailNorm || !password) {
      return res.status(400).json({ error: "Email y contraseña son obligatorios" })
    }
    const User = getUserModel(req.db)
    const exists = await User.findOne({ email: emailNorm })
    if (exists) {
      return res.status(409).json({ error: "Ya existe un usuario con ese email" })
    }
    const hash = await hashPassword(password)
    const user = await User.create({
      email: emailNorm,
      password: hash,
      nombre: (nombre || "").trim(),
      activo: true,
    })
    res.status(201).json(toSafeUser(user))
  } catch (error) {
    console.error("[Users]", error.message)
    res.status(500).json({ error: "Error interno del servidor" })
  }
}

export async function actualizar(req, res) {
  try {
    const requesterId = req.userId
    const { id } = req.params
    const { activo, email, nombre, contraseñaActual, nuevaContraseña } = req.body
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID de usuario no válido" })
    }
    const User = getUserModel(req.db)
    const user = await User.findById(id)
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" })
    const update = {}
    const original = await resolveIsOriginalAdmin(req.db, id)
    if (original) {
      const requesterIsOriginal = await resolveIsOriginalAdmin(req.db, requesterId)
      if (!requesterIsOriginal) {
        return res.status(403).json({ error: "Solo el administrador original puede modificar su propia cuenta" })
      }
    }
    if (typeof activo === "boolean" && !original) {
      update.activo = activo
    } else if (typeof activo === "boolean" && original) {
      return res.status(403).json({ error: "No se puede deshabilitar al administrador original" })
    }
    if (email !== undefined) {
      const emailNorm = (email ?? "").trim().toLowerCase()
      if (!emailNorm) return res.status(400).json({ error: "El email es obligatorio" })
      const exists = await User.findOne({ email: emailNorm, _id: { $ne: id } })
      if (exists) return res.status(409).json({ error: "Ya existe un usuario con ese email" })
      update.email = emailNorm
    }
    if (nombre !== undefined) update.nombre = (nombre ?? "").trim()
    if (contraseñaActual !== undefined && nuevaContraseña !== undefined) {
      if (!nuevaContraseña || nuevaContraseña.length < 8) {
        return res.status(400).json({ error: "La nueva contraseña debe tener al menos 8 caracteres" })
      }
      const userWithPass = await User.findById(id).select("+password")
      if (!userWithPass) return res.status(404).json({ error: "Usuario no encontrado" })
      const ok = await verificarPassword(contraseñaActual, userWithPass.password)
      if (!ok) return res.status(401).json({ error: "Contraseña actual incorrecta" })
      update.password = await hashPassword(nuevaContraseña)
    } else if (contraseñaActual || nuevaContraseña) {
      return res.status(400).json({ error: "Para cambiar la contraseña debes indicar la actual y la nueva" })
    }
    const updated = await User.findByIdAndUpdate(id, update, { new: true }).select("-password").lean()
    res.json(toSafeUser(updated, original))
  } catch (error) {
    console.error("[Users]", error.message)
    res.status(500).json({ error: "Error interno del servidor" })
  }
}

export async function eliminar(req, res) {
  try {
    const requesterId = req.userId
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID de usuario no válido" })
    }
    const User = getUserModel(req.db)
    const user = await User.findById(id).lean()
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" })
    const original = await resolveIsOriginalAdmin(req.db, id)
    if (original) {
      return res.status(403).json({ error: "No se puede eliminar al administrador original" })
    }
    if (user._id.toString() === requesterId?.toString()) {
      return res.status(403).json({ error: "No puedes eliminarte a ti mismo" })
    }
    await User.deleteOne({ _id: id })
    res.status(204).send()
  } catch (error) {
    console.error("[Users]", error.message)
    res.status(500).json({ error: "Error interno del servidor" })
  }
}
