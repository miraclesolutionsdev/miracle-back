import { getUserModel } from '../models/user.model.js'
import { getDb } from '../config/connectionManager.js'
import {
  resolveIsOriginalAdmin,
  generarToken,
  setCookieToken,
  buscarUsuarioGlobal,
  verificarPassword,
  hashPassword,
} from '../services/auth.service.js'

/** Login global — sin tenant middleware. Busca en todos los tenants quién tiene ese email. */
export async function loginGlobal(req, res) {
  try {
    const { email, password } = req.body
    const emailNorm = (email || '').trim().toLowerCase()
    if (!emailNorm || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios.' })
    }

    const result = await buscarUsuarioGlobal(emailNorm)
    if (!result) {
      return res.status(401).json({ error: 'No se encontró una cuenta con ese correo.' })
    }

    const { matchedUser, matchedTenant } = result
    if (matchedUser.activo === false) {
      return res.status(401).json({ error: 'Cuenta deshabilitada. Contacta al administrador.' })
    }
    const ok = await verificarPassword(password, matchedUser.password)
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas.' })

    const tenantDb = await getDb(matchedTenant.dbName)
    const isOriginal = await resolveIsOriginalAdmin(tenantDb, matchedUser._id)
    const token = generarToken(matchedUser._id, matchedTenant.slug)
    setCookieToken(res, token)

    return res.json({
      token,
      user: {
        id: matchedUser._id.toString(),
        email: matchedUser.email,
        nombre: matchedUser.nombre,
        isOriginalAdmin: isOriginal,
        tenantSlug: matchedTenant.slug,
        tenantNombre: matchedTenant.nombre,
      },
      tenant: { slug: matchedTenant.slug, nombre: matchedTenant.nombre },
    })
  } catch (error) {
    console.error('[Auth/Global]', error.message)
    res.status(500).json({ error: 'Error interno del servidor.' })
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body
    const emailNorm = (email || '').trim().toLowerCase()
    if (!emailNorm || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' })
    }

    const User = getUserModel(req.db)
    const user = await User.findOne({ email: emailNorm }).select('+password')
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' })
    if (user.activo === false) {
      return res.status(401).json({ error: 'Cuenta deshabilitada. Contacta al administrador.' })
    }
    const ok = await verificarPassword(password, user.password)
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' })

    const isOriginal = await resolveIsOriginalAdmin(req.db, user._id)
    const token = generarToken(user._id, req.tenantSlug)
    setCookieToken(res, token)

    res.json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        nombre: user.nombre,
        isOriginalAdmin: isOriginal,
        tenantSlug: req.tenantSlug,
        tenantNombre: req.tenantNombre,
      },
    })
  } catch (error) {
    console.error('[Auth]', error.message)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
}

export function logout(req, res) {
  const isProd = process.env.NODE_ENV === 'production'
  res.clearCookie('miracle_token', {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  })
  res.json({ ok: true })
}

export async function obtenerPerfil(req, res) {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: 'No autorizado' })

    const User = getUserModel(req.db)
    const user = await User.findById(userId).select('-password').lean()
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const isOriginal = await resolveIsOriginalAdmin(req.db, userId)

    res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        nombre: user.nombre ?? '',
        isOriginalAdmin: isOriginal,
        tenantSlug: req.tenantSlug,
        tenantNombre: req.tenantNombre,
      },
    })
  } catch (error) {
    console.error('[Auth]', error.message)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
}

export async function actualizarPerfil(req, res) {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: 'No autorizado' })

    const { email, nombre } = req.body
    const emailNorm = (email ?? '').trim().toLowerCase()
    const updates = {}

    const User = getUserModel(req.db)
    if (emailNorm) {
      const exists = await User.findOne({ email: emailNorm, _id: { $ne: userId } })
      if (exists) return res.status(409).json({ error: 'Ya existe un usuario con ese email' })
      updates.email = emailNorm
    }
    if (nombre !== undefined) updates.nombre = (nombre ?? '').trim()

    const user = await User.findByIdAndUpdate(userId, updates, { new: true })
      .select('-password')
      .lean()
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        nombre: user.nombre ?? '',
      },
    })
  } catch (error) {
    console.error('[Auth]', error.message)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
}

export async function cambiarPassword(req, res) {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ error: 'No autorizado' })

    const { contraseñaActual, nuevaContraseña } = req.body
    if (!contraseñaActual || !nuevaContraseña) {
      return res.status(400).json({ error: 'Contraseña actual y nueva son obligatorias' })
    }
    if (nuevaContraseña.length < 8) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' })
    }

    const User = getUserModel(req.db)
    const user = await User.findById(userId).select('+password')
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const ok = await verificarPassword(contraseñaActual, user.password)
    if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' })

    const hash = await hashPassword(nuevaContraseña)
    await User.updateOne({ _id: userId }, { password: hash })
    res.json({ ok: true, message: 'Contraseña actualizada' })
  } catch (error) {
    console.error('[Auth]', error.message)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
}
