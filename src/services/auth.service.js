import { getUserModel } from '../models/user.model.js'
import { getTenantModel } from '../models/tenant.model.js'
import { getRegistryDb, getDb } from '../config/connectionManager.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET
const SALT_ROUNDS = 10

/** Determina si userId es el administrador original del tenant. */
export async function resolveIsOriginalAdmin(db, userId) {
  const User = getUserModel(db)
  const users = await User.find({})
    .select('_id isOriginalAdmin')
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

/** Genera un JWT firmado para el usuario/tenant dado. */
export function generarToken(userId, tenantSlug) {
  return jwt.sign(
    { userId: userId.toString(), tenantSlug },
    JWT_SECRET,
    { expiresIn: '1d' }
  )
}

/** Configura la cookie httpOnly del token según el entorno. */
export function setCookieToken(res, token) {
  const isProd = process.env.NODE_ENV === 'production'
  res.cookie('miracle_token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  })
}

/**
 * Busca en todos los tenants el usuario con el email dado.
 * @returns {{ matchedUser, matchedTenant } | null}
 */
export async function buscarUsuarioGlobal(emailNorm) {
  const registryDb = await getRegistryDb()
  const Tenant = getTenantModel(registryDb)
  const tenants = await Tenant.find({}).lean()

  for (const tenant of tenants) {
    const tenantDb = await getDb(tenant.dbName)
    const User = getUserModel(tenantDb)
    const user = await User.findOne({ email: emailNorm }).select('+password')
    if (user) return { matchedUser: user, matchedTenant: tenant }
  }
  return null
}

/** Verifica la contraseña contra el hash almacenado. */
export async function verificarPassword(plainText, hash) {
  return bcrypt.compare(plainText, hash)
}

/** Hashea una contraseña nueva. */
export async function hashPassword(plainText) {
  return bcrypt.hash(plainText, SALT_ROUNDS)
}
