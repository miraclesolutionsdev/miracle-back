import jwt from "jsonwebtoken"
import { getDb, getRegistryDb } from "../config/connectionManager.js"
import { getTenantModel } from "../models/tenant.model.js"

const tenantCache = new Map()
const CACHE_TTL = 5 * 60 * 1000

function getCached(slug) {
  const entry = tenantCache.get(slug)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL) {
    tenantCache.delete(slug)
    return null
  }
  return entry.tenant
}

/**
 * Resuelve el tenant en este orden de prioridad:
 *  1. Header X-Tenant-Slug (enviado por el frontend desde la URL)
 *  2. tenantSlug dentro del JWT (cookie o Authorization header)
 *
 * Funciona igual en local y en producción — sin env vars de parche.
 */
export async function tenantMiddleware(req, res, next) {
  try {
    let slug = req.headers["x-tenant-slug"]?.trim()?.toLowerCase()

    // Fallback: extraer tenantSlug del JWT si no viene el header
    if (!slug) {
      const token =
        req.cookies?.miracle_token ||
        (req.headers.authorization?.startsWith("Bearer ")
          ? req.headers.authorization.slice(7)
          : null)
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET)
          slug = decoded.tenantSlug?.toLowerCase()
        } catch { /* token inválido o expirado */ }
      }
    }

    if (!slug) {
      return res.status(400).json({ error: "No se pudo determinar el tenant." })
    }

    let tenant = getCached(slug)

    if (!tenant) {
      const registryDb = await getRegistryDb()
      const Tenant = getTenantModel(registryDb)
      tenant = await Tenant.findOne({ slug }).lean()
      if (tenant) tenantCache.set(slug, { tenant, ts: Date.now() })
    }

    if (!tenant) {
      return res.status(404).json({ error: `Tenant "${slug}" no encontrado.` })
    }

    req.db = await getDb(tenant.dbName)
    req.tenantSlug = tenant.slug
    req.tenantNombre = tenant.nombre
    req.tenantDbName = tenant.dbName
    req.elevenLabsAgentId = tenant.elevenLabsAgentId || null
    req.tenantDominio = tenant.dominios?.[0] || null

    next()
  } catch (err) {
    console.error("[Tenant]", err.message)
    res.status(503).json({ error: "Error al resolver el tenant." })
  }
}
