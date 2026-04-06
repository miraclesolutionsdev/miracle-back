import { getUserModel } from "../models/user.model.js"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET
const SALT_ROUNDS = 10

/** Determina si userId es el administrador original (el primero creado o el marcado en BD). */
async function resolveIsOriginalAdmin(db, userId) {
  const User = getUserModel(db)
  const users = await User.find({})
    .select("_id isOriginalAdmin")
    .sort({ createdAt: 1 })
    .lean()
  if (!users.length) return false
  const targetId = userId.toString()
  const target = users.find((u) => u._id.toString() === targetId)
  if (!target) return false
  if (target.isOriginalAdmin === true) return true
  const hasAnyOriginal = users.some((u) => u.isOriginalAdmin === true)
  if (hasAnyOriginal) return false
  return users[0]._id.toString() === targetId
}

export async function login(req, res) {
  try {
    const { email, password } = req.body
    const emailNorm = (email || "").trim().toLowerCase()
    if (!emailNorm || !password) {
      return res.status(400).json({ error: "Email y contraseña son obligatorios" })
    }

    const User = getUserModel(req.db)
    const user = await User.findOne({ email: emailNorm }).select("+password")
    if (!user) return res.status(401).json({ error: "Credenciales inválidas" })
    if (user.activo === false) {
      return res.status(401).json({ error: "Cuenta deshabilitada. Contacta al administrador." })
    }
    const ok = await bcrypt.compare(password, user.password)
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" })

    const token = jwt.sign(
      { userId: user._id.toString(), tenantSlug: req.tenantSlug },
      JWT_SECRET,
      { expiresIn: "1d" }
    )

    const isOriginal = await resolveIsOriginalAdmin(req.db, user._id)

    const isProd = process.env.NODE_ENV === "production"
    res.cookie("miracle_token", token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    })

    res.json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        nombre: user.nombre,
        isOriginalAdmin: isOriginal,
        tenantNombre: req.tenantNombre,
      },
    })
  } catch (error) {
    console.error("[Auth]", error.message)
    res.status(500).json({ error: "Error interno del servidor" })
  }
}

export function logout(req, res) {
  const isProd = process.env.NODE_ENV === "production"
  res.clearCookie("miracle_token", {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  })
  res.json({ ok: true })
}

export async function obtenerPerfil(req, res) {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: "No autorizado" })

    const User = getUserModel(req.db)
    const user = await User.findById(userId).select("-password").lean()
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" })

    const isOriginal = await resolveIsOriginalAdmin(req.db, userId)

    res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        nombre: user.nombre ?? "",
        isOriginalAdmin: isOriginal,
        tenantNombre: req.tenantNombre,
      },
    })
  } catch (error) {
    console.error("[Auth]", error.message)
    res.status(500).json({ error: "Error interno del servidor" })
  }
}

export async function actualizarPerfil(req, res) {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: "No autorizado" })

    const { email, nombre } = req.body
    const emailNorm = (email ?? "").trim().toLowerCase()
    const updates = {}

    const User = getUserModel(req.db)
    if (emailNorm) {
      const exists = await User.findOne({ email: emailNorm, _id: { $ne: userId } })
      if (exists) return res.status(409).json({ error: "Ya existe un usuario con ese email" })
      updates.email = emailNorm
    }
    if (nombre !== undefined) updates.nombre = (nombre ?? "").trim()

    const user = await User.findByIdAndUpdate(userId, updates, { new: true })
      .select("-password")
      .lean()
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" })

    res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        nombre: user.nombre ?? "",
      },
    })
  } catch (error) {
    console.error("[Auth]", error.message)
    res.status(500).json({ error: "Error interno del servidor" })
  }
}

export async function cambiarPassword(req, res) {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: "No autorizado" })

    const { contraseñaActual, nuevaContraseña } = req.body
    if (!contraseñaActual || !nuevaContraseña) {
      return res.status(400).json({ error: "Contraseña actual y nueva son obligatorias" })
    }
    if (nuevaContraseña.length < 8) {
      return res.status(400).json({ error: "La nueva contraseña debe tener al menos 8 caracteres" })
    }

    const User = getUserModel(req.db)
    const user = await User.findById(userId).select("+password")
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" })

    const ok = await bcrypt.compare(contraseñaActual, user.password)
    if (!ok) return res.status(401).json({ error: "Contraseña actual incorrecta" })

    const hash = await bcrypt.hash(nuevaContraseña, SALT_ROUNDS)
    await User.updateOne({ _id: userId }, { password: hash })
    res.json({ ok: true, message: "Contraseña actualizada" })
  } catch (error) {
    console.error("[Auth]", error.message)
    res.status(500).json({ error: "Error interno del servidor" })
  }
}
