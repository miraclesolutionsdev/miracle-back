import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import { getRegistryDb, getDb } from "../config/connectionManager.js"
import { getTenantModel } from "../models/tenant.model.js"
import { getUserModel } from "../models/user.model.js"

const JWT_SECRET = process.env.JWT_SECRET
const SALT_ROUNDS = 10

function generarSlug(nombre) {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 40)
}

export async function registrarTenant(req, res) {
  try {
    const { nombreTienda, email, password, nombre } = req.body

    if (!nombreTienda?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: "nombreTienda, email y password son obligatorios." })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." })
    }

    const slug = generarSlug(nombreTienda.trim())
    if (!slug) {
      return res.status(400).json({ error: "El nombre de la empresa no genera un identificador válido." })
    }

    const emailNorm = email.trim().toLowerCase()
    const registryDb = await getRegistryDb()
    const Tenant = getTenantModel(registryDb)

    const exists = await Tenant.findOne({ slug })
    if (exists) {
      return res.status(409).json({ error: `El nombre "${nombreTienda}" ya está registrado.` })
    }

    const dbName = `${slug}db`
    await Tenant.create({ slug, dbName, nombre: nombreTienda.trim(), dominios: [], plantilla: 'luxury' })

    const tenantDb = await getDb(dbName)
    const User = getUserModel(tenantDb)
    const hash = await bcrypt.hash(password, SALT_ROUNDS)
    const user = await User.create({
      email: emailNorm,
      password: hash,
      nombre: (nombre || "").trim(),
      activo: true,
      isOriginalAdmin: true,
    })

    const token = jwt.sign(
      { userId: user._id.toString(), tenantSlug: slug },
      JWT_SECRET,
      { expiresIn: "1d" }
    )

    const isProd = process.env.NODE_ENV === "production"
    res.cookie("miracle_token", token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    })

    console.log(`✅ Nuevo tenant: ${slug} (DB: ${dbName})`)

    res.status(201).json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        nombre: user.nombre,
        isOriginalAdmin: true,
        tenantSlug: slug,
        tenantNombre: nombreTienda.trim(),
      },
      tenant: { slug, nombre: nombreTienda.trim() },
    })
  } catch (error) {
    console.error("[Register]", error.message)
    res.status(500).json({ error: "Error interno del servidor." })
  }
}
