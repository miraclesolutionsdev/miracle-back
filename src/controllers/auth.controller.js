import User from "../models/user.model.js"
import Tenant from "../models/tenant.model.js"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET || "tu-clave-secreta-cambiar-en-produccion"
const SALT_ROUNDS = 10

export async function login(req, res) {
  try {
    const { email, password } = req.body
    const emailNorm = (email || "").trim().toLowerCase()
    if (!emailNorm || !password) {
      return res.status(400).json({ error: "Email y contraseña son obligatorios" })
    }
    const user = await User.findOne({ email: emailNorm }).select("+password")
    if (!user) return res.status(401).json({ error: "Credenciales inválidas" })
    const ok = await bcrypt.compare(password, user.password)
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" })
    const token = jwt.sign(
      { userId: user._id.toString(), tenantId: user.tenantId.toString() },
      JWT_SECRET,
      { expiresIn: "7d" }
    )
    const tenant = await Tenant.findById(user.tenantId)
    res.json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        nombre: user.nombre,
        tenantId: user.tenantId.toString(),
        tenantNombre: tenant?.nombre || "",
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function register(req, res) {
  try {
    const { email, password, nombre, tenantId } = req.body
    const emailNorm = (email || "").trim().toLowerCase()
    if (!emailNorm || !password || !tenantId) {
      return res.status(400).json({ error: "Email, contraseña y tenantId son obligatorios" })
    }
    const exists = await User.findOne({ email: emailNorm, tenantId })
    if (exists) {
      return res.status(409).json({ error: "Ya existe un usuario con ese email en este tenant" })
    }
    const hash = await bcrypt.hash(password, SALT_ROUNDS)
    const user = await User.create({
      email: emailNorm,
      password: hash,
      nombre: (nombre || "").trim(),
      tenantId,
    })
    const tenant = await Tenant.findById(tenantId)
    const token = jwt.sign(
      { userId: user._id.toString(), tenantId: user.tenantId.toString() },
      JWT_SECRET,
      { expiresIn: "7d" }
    )
    res.status(201).json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        nombre: user.nombre,
        tenantId: user.tenantId.toString(),
        tenantNombre: tenant?.nombre || "",
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

/** Genera slug único a partir del nombre (sin acentos, minúsculas, guiones) */
function slugify(text) {
  return (text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "tienda"
}

export async function crearTienda(req, res) {
  try {
    const { nombreTienda, email, password, nombre } = req.body
    const nombreTiendaTrim = (nombreTienda || "").trim()
    const emailNorm = (email || "").trim().toLowerCase()
    if (!nombreTiendaTrim) {
      return res.status(400).json({ error: "El nombre de la tienda o compañía es obligatorio" })
    }
    if (!emailNorm || !password) {
      return res.status(400).json({ error: "Email y contraseña son obligatorios" })
    }
    let baseSlug = slugify(nombreTiendaTrim)
    let slug = baseSlug
    let counter = 0
    while (await Tenant.findOne({ slug })) {
      counter += 1
      slug = `${baseSlug}-${counter}`
    }
    const tenant = await Tenant.create({
      nombre: nombreTiendaTrim,
      slug,
    })
    const exists = await User.findOne({ email: emailNorm, tenantId: tenant._id })
    if (exists) {
      await Tenant.findByIdAndDelete(tenant._id)
      return res.status(409).json({ error: "Ya existe un usuario con ese email en esta tienda" })
    }
    const globalEmailExists = await User.findOne({ email: emailNorm })
    if (globalEmailExists) {
      await Tenant.findByIdAndDelete(tenant._id)
      return res.status(409).json({
        error: "Ese email ya está registrado en otra tienda. Usa otro email o inicia sesión en la tienda correspondiente.",
      })
    }
    const hash = await bcrypt.hash(password, SALT_ROUNDS)
    const user = await User.create({
      email: emailNorm,
      password: hash,
      nombre: (nombre || "").trim() || nombreTiendaTrim,
      tenantId: tenant._id,
    })
    const token = jwt.sign(
      { userId: user._id.toString(), tenantId: user.tenantId.toString() },
      JWT_SECRET,
      { expiresIn: "7d" }
    )
    res.status(201).json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        nombre: user.nombre,
        tenantId: user.tenantId.toString(),
        tenantNombre: tenant.nombre,
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
