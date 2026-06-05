import { getRegistryDb, getDb } from "../config/connectionManager.js"
import { getTenantModel } from "../models/tenant.model.js"
import { getUserModel } from "../models/user.model.js"
import { hashPassword, generarToken, setCookieToken } from "../services/auth.service.js"

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
    const hash = await hashPassword(password)
    const user = await User.create({
      email: emailNorm,
      password: hash,
      nombre: (nombre || "").trim(),
      activo: true,
      isOriginalAdmin: true,
    })

    const token = generarToken(user._id, slug)
    setCookieToken(res, token)

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
