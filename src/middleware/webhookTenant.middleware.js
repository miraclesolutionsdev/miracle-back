import { getDb, getRegistryDb } from '../config/connectionManager.js'
import { getTenantModel } from '../models/tenant.model.js'

/**
 * Middleware para webhooks que identifica el tenant por agent_id del body.
 * A diferencia de tenantMiddleware, este NO requiere X-Tenant-Slug header.
 */
export async function webhookTenantMiddleware(req, res, next) {
  try {
    const { agent_id } = req.body

    if (!agent_id) {
      return res.status(400).json({ error: 'Falta agent_id en el payload' })
    }

    // Buscar tenant por agent_id
    const registryDb = await getRegistryDb()
    const Tenant = getTenantModel(registryDb)
    const tenant = await Tenant.findOne({ elevenLabsAgentId: agent_id }).lean()

    if (!tenant) {
      console.warn(`[Webhook] No se encontró tenant para agentId: ${agent_id}`)
      return res.status(404).json({ error: `No se encontró tenant para el agente ${agent_id}` })
    }

    // Inyectar datos del tenant en req
    req.db = await getDb(tenant.dbName)
    req.tenantSlug = tenant.slug
    req.tenantNombre = tenant.nombre
    req.tenantDbName = tenant.dbName
    req.elevenLabsAgentId = tenant.elevenLabsAgentId

    next()
  } catch (err) {
    console.error('[Webhook Tenant Middleware]', err.message)
    res.status(503).json({ error: 'Error al resolver el tenant.' })
  }
}
