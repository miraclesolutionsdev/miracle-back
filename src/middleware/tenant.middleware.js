import { getDb, getRegistryDb } from "../config/connectionManager.js"
import { getTenantModel } from "../models/tenant.model.js"

// Cache hostname → tenant doc para evitar queries repetidas al registry
const tenantCache = new Map()

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
    const hostname = req.hostname

    let tenant = tenantCache.get(hostname)

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

      if (tenant) tenantCache.set(hostname, tenant)
    }

    if (!tenant) {
      return res.status(404).json({ error: "Tenant no encontrado para este dominio" })
    }

    req.db = await getDb(tenant.dbName)
    req.tenantSlug = tenant.slug
    req.tenantDbName = tenant.dbName
    next()
  } catch (err) {
    console.error("[Tenant]", err.message)
    res.status(503).json({ error: "Error al resolver el tenant" })
  }
}
