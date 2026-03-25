import User from "../models/user.model.js"
import Tenant from "../models/tenant.model.js"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import { obtenerPresignedPutLogo } from "../services/s3.service.js"

const JWT_SECRET = process.env.JWT_SECRET || "tu-clave-secreta-cambiar-en-produccion"
const SALT_ROUNDS = 10

/** Determina si userId es el administrador original (el primero creado o el marcado en BD). */
async function resolveIsOriginalAdmin(userId) {
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
    const user = await User.findOne({ email: emailNorm }).select("+password")
    if (!user) return res.status(401).json({ error: "Credenciales inválidas" })
    if (user.activo === false) {
      return res.status(401).json({ error: "Cuenta deshabilitada. Contacta al administrador." })
    }
    const ok = await bcrypt.compare(password, user.password)
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" })

    const token = jwt.sign(
      { userId: user._id.toString() },
      JWT_SECRET,
      { expiresIn: "7d" }
    )

    const [tenant, isOriginal] = await Promise.all([
      Tenant.findOne().lean(),
      resolveIsOriginalAdmin(user._id),
    ])

    res.json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        nombre: user.nombre,
        tenantNombre: tenant?.nombre || "",
        isOriginalAdmin: isOriginal,
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
    const alreadyExists = await Tenant.findOne().select("_id").lean()
    if (alreadyExists) {
      return res.status(409).json({ error: "La tienda ya fue creada. Inicia sesión para acceder." })
    }

    const { nombreTienda, email, password, nombre } = req.body
    const nombreTiendaTrim = (nombreTienda || "").trim()
    const emailNorm = (email || "").trim().toLowerCase()
    if (!nombreTiendaTrim) {
      return res.status(400).json({ error: "El nombre de la tienda o compañía es obligatorio" })
    }
    if (!emailNorm || !password) {
      return res.status(400).json({ error: "Email y contraseña son obligatorios" })
    }

    const existingEmail = await User.findOne({ email: emailNorm })
    if (existingEmail) {
      return res.status(409).json({ error: "Ese email ya está registrado. Inicia sesión." })
    }

    let baseSlug = slugify(nombreTiendaTrim)
    let slug = baseSlug
    let counter = 0
    while (await Tenant.findOne({ slug })) {
      counter += 1
      slug = `${baseSlug}-${counter}`
    }

    const tenant = await Tenant.create({ nombre: nombreTiendaTrim, slug })

    const hash = await bcrypt.hash(password, SALT_ROUNDS)
    const user = await User.create({
      email: emailNorm,
      password: hash,
      nombre: (nombre || "").trim() || nombreTiendaTrim,
      tenantId: tenant._id,
      activo: true,
      isOriginalAdmin: true,
    })

    const token = jwt.sign(
      { userId: user._id.toString(), tenantId: tenant._id.toString() },
      JWT_SECRET,
      { expiresIn: "7d" }
    )

    res.status(201).json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        nombre: user.nombre,
        tenantId: tenant._id.toString(),
        tenantNombre: tenant.nombre,
        isOriginalAdmin: true,
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function obtenerPerfil(req, res) {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: "No autorizado" })

    const user = await User.findById(userId).select("-password").lean()
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" })

    const [tenant, isOriginal] = await Promise.all([
      Tenant.findOne().lean(),
      resolveIsOriginalAdmin(userId),
    ])

    res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        nombre: user.nombre ?? "",
        tenantNombre: tenant?.nombre ?? "",
        isOriginalAdmin: isOriginal,
      },
      tenant: tenant
        ? {
            id: tenant._id.toString(),
            nombre: tenant.nombre ?? "",
            logoUrl: tenant.logoUrl ?? "",
            descripcion: tenant.descripcion ?? "",
            eslogan: tenant.eslogan ?? "",
            categoria: tenant.categoria ?? "",
            productosPrincipales: Array.isArray(tenant.productosPrincipales)
              ? tenant.productosPrincipales
              : [],
          }
        : {
            id: "",
            nombre: "",
            logoUrl: "",
            descripcion: "",
            eslogan: "",
            categoria: "",
            productosPrincipales: [],
          },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function actualizarPerfil(req, res) {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: "No autorizado" })

    const { email, nombre } = req.body
    const emailNorm = (email ?? "").trim().toLowerCase()
    const updates = {}

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

    const tenant = await Tenant.findOne().lean()

    res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        nombre: user.nombre ?? "",
        tenantNombre: tenant?.nombre ?? "",
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
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
    if (nuevaContraseña.length < 6) {
      return res.status(400).json({ error: "La nueva contraseña debe tener al menos 6 caracteres" })
    }

    const user = await User.findById(userId).select("+password")
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" })

    const ok = await bcrypt.compare(contraseñaActual, user.password)
    if (!ok) return res.status(401).json({ error: "Contraseña actual incorrecta" })

    const hash = await bcrypt.hash(nuevaContraseña, SALT_ROUNDS)
    await User.updateOne({ _id: userId }, { password: hash })
    res.json({ ok: true, message: "Contraseña actualizada" })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function actualizarTenant(req, res) {
  try {
    const { nombre, logoUrl, descripcion, eslogan, categoria, productosPrincipales } = req.body
    const updates = {}

    if (nombre !== undefined) {
      const nombreTrim = (nombre ?? "").trim()
      if (!nombreTrim) return res.status(400).json({ error: "El nombre de la tienda es obligatorio" })
      updates.nombre = nombreTrim
    }
    if (logoUrl !== undefined) updates.logoUrl = (logoUrl ?? "").trim()
    if (descripcion !== undefined) updates.descripcion = (descripcion ?? "").trim()
    if (eslogan !== undefined) updates.eslogan = (eslogan ?? "").trim()
    if (categoria !== undefined) updates.categoria = (categoria ?? "").trim()
    if (productosPrincipales !== undefined) {
      updates.productosPrincipales = Array.isArray(productosPrincipales)
        ? productosPrincipales.map((p) => (p ?? "").toString().trim()).filter(Boolean)
        : []
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No hay cambios para actualizar" })
    }

    const tenant = await Tenant.findOneAndUpdate({}, updates, { new: true }).lean()
    if (!tenant) return res.status(404).json({ error: "Tienda no encontrada" })

    res.json({
      tenant: {
        id: tenant._id.toString(),
        nombre: tenant.nombre,
        logoUrl: tenant.logoUrl ?? "",
        descripcion: tenant.descripcion ?? "",
        eslogan: tenant.eslogan ?? "",
        productosPrincipales: Array.isArray(tenant.productosPrincipales)
          ? tenant.productosPrincipales
          : [],
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

/**
 * Devuelve una URL firmada para subir el logo de la tienda a S3.
 * El frontend debe luego llamar a actualizarTenant con logoUrl = publicUrl.
 */
export async function obtenerPresignedLogoTenant(req, res) {
  try {
    const { filename, contentType } = req.body || {}
    const name = (filename || "").trim() || "logo.png"
    const type = (contentType || "").trim() || "image/png"

    const { uploadUrl, key, publicUrl } = await obtenerPresignedPutLogo("miracle", name, type)
    res.json({ uploadUrl, key, publicUrl })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
