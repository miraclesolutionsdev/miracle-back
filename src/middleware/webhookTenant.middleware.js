import { getDb, getRegistryDb } from '../config/connectionManager.js'
import { getTenantModel } from '../models/tenant.model.js'
import { Payment, MercadoPagoConfig } from 'mercadopago'

/**
 * Middleware para webhooks que identifica el tenant según el tipo de webhook:
 * - ElevenLabs: usa agent_id del body o header
 * - MercadoPago: usa tenantSlug de metadata del pago
 */
export async function webhookTenantMiddleware(req, res, next) {
  try {
    const registryDb = await getRegistryDb()
    const Tenant = getTenantModel(registryDb)
    let tenant = null

    // Detectar tipo de webhook según body o header
    const agent_id = req.body.agent_id || req.headers['x-agent-id']
    const isMercadoPagoWebhook = req.body.type === 'payment' && req.body.data?.id

    if (agent_id) {
      // Webhook de ElevenLabs
      tenant = await Tenant.findOne({ elevenLabsAgentId: agent_id }).lean()
      if (!tenant) {
        console.warn(`[Webhook] No se encontró tenant para agentId: ${agent_id}`)
        return res.status(404).json({ error: `No se encontró tenant para el agente ${agent_id}` })
      }
    } else if (isMercadoPagoWebhook) {
      // Webhook de MercadoPago: extraer tenant de metadata del pago
      try {
        const paymentId = Number(req.body.data.id)
        const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN })
        const paymentApi = new Payment(client)
        const pago = await paymentApi.get({ id: paymentId })

        // Inyectar el pago en req para que el controller no lo vuelva a fetchear
        req.mercadoPagoPago = pago

        const tenantSlug = pago.metadata?.tenant_slug || pago.metadata?.tenantSlug
        if (!tenantSlug) {
          console.error('[MP Webhook] No se encontró tenantSlug en metadata del pago:', paymentId)
          return res.status(400).json({ error: 'No se encontró tenantSlug en metadata del pago' })
        }

        tenant = await Tenant.findOne({ slug: tenantSlug }).lean()
        if (!tenant) {
          console.warn(`[MP Webhook] No se encontró tenant para slug: ${tenantSlug}`)
          return res.status(404).json({ error: `No se encontró tenant ${tenantSlug}` })
        }
        console.log(`[MP Webhook] ✓ Tenant encontrado: ${tenant.nombre} (slug: ${tenant.slug}, dbName: ${tenant.dbName})`)
      } catch (mpError) {
        console.error('[MP Webhook] Error obteniendo pago:', mpError.message)
        return res.status(500).json({ error: 'Error al obtener información del pago' })
      }
    } else {
      console.error('[Webhook] No se pudo identificar el tipo de webhook. Body:', JSON.stringify(req.body))
      return res.status(400).json({ error: 'Webhook no soportado' })
    }

    // Inyectar datos del tenant en req
    console.log(`[Webhook Middleware] Conectando a DB: "${tenant.dbName}"`)
    req.db = await getDb(tenant.dbName)
    req.tenantSlug = tenant.slug
    req.tenantNombre = tenant.nombre
    req.tenantDbName = tenant.dbName
    req.elevenLabsAgentId = tenant.elevenLabsAgentId || null
    req.tenantDominio = tenant.dominios?.[0] || null
    console.log(`[Webhook Middleware] ✓ req.db conectado a: ${req.db.name}`)

    next()
  } catch (err) {
    console.error('[Webhook Tenant Middleware]', err.message)
    res.status(503).json({ error: 'Error al resolver el tenant.' })
  }
}
