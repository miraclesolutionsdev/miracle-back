import { getDb, getRegistryDb } from "../config/connectionManager.js"
import { getTenantModel } from "../models/tenant.model.js"

// Cache hostname → { tenant, ts } con TTL de 5 minutos
const tenantCache = new Map()
const TENANT_CACHE_TTL = 5 * 60 * 1000

function getCached(hostname) {
  const entry = tenantCache.get(hostname)
  if (!entry) return null
  if (Date.now() - entry.ts > TENANT_CACHE_TTL) {
    tenantCache.delete(hostname)
    return null
  }
  return entry.tenant
}

/**
 * Resuelve el tenant a partir del hostname de la petición.
 * Adjunta req.db, req.tenantSlug y req.tenantDbName para los controllers.
 *
 * Lógica de resolución:
 *   1. localhost / 127.0.0.1 → DEV_TENANT_SLUG (default: "miraclesolutions")
 *   2. Dominio exacto en tenant.dominios (ej. "tiendazapatos.com.co")
 *   3. Primer segmento del hostname como slug (ej. "miraclesolutions.com.co" → "miraclesolutions")
 */
export async function tenantMiddleware(req, res, next) {
  try {
    // Usar el header Origin/Referer para obtener el dominio del FRONTEND,
    // no req.hostname que devuelve el dominio del backend (ej. en Vercel)
    let hostname = req.hostname
    const origin = req.headers.origin || req.headers.referer || ""
    if (origin) {
      try {
        hostname = new URL(origin).hostname
      } catch { /* mantener req.hostname como fallback */ }
    }

    let tenant = getCached(hostname)

    if (!tenant) {
      const registryDb = await getRegistryDb()
      const Tenant = getTenantModel(registryDb)

      if (hostname === "localhost" || hostname === "127.0.0.1") {
        const devSlug = process.env.DEV_TENANT_SLUG || "miraclesolutions"
        tenant = await Tenant.findOne({ slug: devSlug }).lean()
      } else {
        // Buscar por dominio custom registrado
        tenant = await Tenant.findOne({ dominios: hostname }).lean()

        if (!tenant) {
          // Extraer slug del primer segmento del hostname
          const slug = hostname.split(".")[0]
          tenant = await Tenant.findOne({ slug }).lean()
        }
      }

      if (tenant) tenantCache.set(hostname, { tenant, ts: Date.now() })
    }

    if (!tenant) {
      return res.status(404).json({ error: "Tenant no encontrado para este dominio" })
    }

    req.db = await getDb(tenant.dbName)
    req.tenantSlug = tenant.slug
    req.tenantDbName = tenant.dbName
    req.tenantNombre = tenant.nombre
    req.elevenLabsAgentId = tenant.elevenLabsAgentId || null
    next()
  } catch (err) {
    console.error("[Tenant]", err.message)
    res.status(503).json({ error: "Error al resolver el tenant" })
  }
}
