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
    .replace(/[\u0300-\u036f]/g, "")  // quitar tildes
    .replace(/[^a-z0-9]/g, "")        // solo alfanumérico
    .slice(0, 40)
}

export async function registrarTenant(req, res) {
  try {
    const { nombreTienda, email, password, nombre, dominio } = req.body

    if (!nombreTienda?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: "nombreTienda, email y password son obligatorios" })
    }

    // Validar y limpiar dominio propio si viene
    let dominioCustom = null
    if (dominio?.trim()) {
      dominioCustom = dominio.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "")
      // Validación básica de formato
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dominioCustom)) {
        return res.status(400).json({ error: "El dominio ingresado no es válido. Ej: venompharmacol.com" })
      }
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" })
    }

    const emailNorm = email.trim().toLowerCase()
    const slug = generarSlug(nombreTienda.trim())

    if (!slug) {
      return res.status(400).json({ error: "El nombre de la tienda no es válido para generar un identificador" })
    }

    const registryDb = await getRegistryDb()
    const Tenant = getTenantModel(registryDb)

    // Verificar unicidad del slug
    const exists = await Tenant.findOne({ slug })
    if (exists) {
      return res.status(409).json({ error: `El nombre "${nombreTienda}" ya está registrado. Elige otro nombre.` })
    }

    const dbName = `${slug}db`
    const mainDomain = process.env.MAIN_DOMAIN || "miraclesolutions.com.co"

    // Si tiene dominio propio, usarlo. Si no, generar subdominio automático.
    const dominios = dominioCustom
      ? [dominioCustom, `www.${dominioCustom}`]
      : [`${slug}.${mainDomain}`, `www.${slug}.${mainDomain}`]

    await Tenant.create({
      slug,
      dbName,
      nombre: nombreTienda.trim(),
      dominios,
    })

    // Conectar al nuevo DB y crear el primer usuario
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

    console.log(`✅ Nuevo tenant creado: ${slug} (DB: ${dbName})`)

    res.status(201).json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        nombre: user.nombre,
        isOriginalAdmin: true,
        tenantNombre: nombreTienda.trim(),
      },
      tenant: {
        slug,
        dbName,
        nombre: nombreTienda.trim(),
        accessUrl: `https://${dominios[0]}`,
      },
    })
  } catch (error) {
    console.error("[Register]", error.message)
    res.status(500).json({ error: "Error interno del servidor" })
  }
}
