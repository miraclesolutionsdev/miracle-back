import { getRegistryDb } from '../config/connectionManager.js'
import { getTenantModel } from '../models/tenant.model.js'

/**
 * GET /store-config/info?slug=venompharmacol
 * Público. Retorna nombre e info básica del tenant para mostrar en la tienda.
 */
export async function infoTienda(req, res) {
  const slug = (req.query.slug || '').trim().toLowerCase()
  if (!slug) return res.status(400).json({ error: 'Falta el parámetro slug.' })
  try {
    const registryDb = await getRegistryDb()
    const Tenant = getTenantModel(registryDb)
    const tenant = await Tenant.findOne({ slug }).lean()
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado.' })
    return res.json({ slug: tenant.slug, nombre: tenant.nombre, dominio: tenant.dominios?.[0] || null, plantilla: tenant.plantilla || 'luxury' })
  } catch (err) {
    console.error('[StoreConfig]', err.message)
    return res.status(500).json({ error: 'Error interno.' })
  }
}

/**
 * GET /store-config/dominio?hostname=venompharmacol.com
 * Público. Dado un hostname, retorna el slug y nombre del tenant.
 * El frontend lo usa para renderizar la tienda correcta cuando
 * alguien entra desde un dominio custom.
 */
export async function resolverPorDominio(req, res) {
  const hostname = (req.query.hostname || '').trim().toLowerCase().replace(/^www\./, '')
  if (!hostname) {
    return res.status(400).json({ error: 'Falta el parámetro hostname.' })
  }
  try {
    const registryDb = await getRegistryDb()
    const Tenant = getTenantModel(registryDb)
    const tenant = await Tenant.findOne({ dominios: hostname }).lean()
    if (!tenant) {
      return res.status(404).json({ error: `No hay tenant registrado para "${hostname}".` })
    }
    return res.json({ slug: tenant.slug, nombre: tenant.nombre, plantilla: tenant.plantilla || 'luxury' })
  } catch (err) {
    console.error('[StoreConfig]', err.message)
    return res.status(500).json({ error: 'Error interno.' })
  }
}

/**
 * PATCH /store-config/plantilla
 * Protegido. El admin elige la plantilla visual de su tienda.
 * Body: { plantilla: "fitness" }
 */
export async function guardarPlantilla(req, res) {
  const plantilla = (req.body.plantilla || '').trim().toLowerCase()
  const validas = ['luxury', 'fitness', 'minimal', 'food', 'modern']
  if (!validas.includes(plantilla)) {
    return res.status(400).json({ error: `Plantilla inválida. Opciones: ${validas.join(', ')}` })
  }
  try {
    const registryDb = await getRegistryDb()
    const Tenant = getTenantModel(registryDb)
    await Tenant.updateOne({ slug: req.tenantSlug }, { $set: { plantilla } })
    return res.json({ ok: true, plantilla })
  } catch (err) {
    console.error('[StoreConfig]', err.message)
    return res.status(500).json({ error: 'Error interno.' })
  }
}

/**
 * PATCH /store-config/dominio
 * Protegido. El admin guarda su dominio custom.
 * Body: { dominio: "venompharmacol.com" }
 */
export async function guardarDominio(req, res) {
  const dominio = (req.body.dominio || '').trim().toLowerCase().replace(/^www\./, '')
  if (!dominio) {
    return res.status(400).json({ error: 'Falta el campo dominio.' })
  }
  try {
    const registryDb = await getRegistryDb()
    const Tenant = getTenantModel(registryDb)

    // Verificar que ese dominio no esté en uso por otro tenant
    const existente = await Tenant.findOne({
      dominios: dominio,
      slug: { $ne: req.tenantSlug },
    }).lean()
    if (existente) {
      return res.status(409).json({ error: `El dominio "${dominio}" ya está en uso.` })
    }

    // Guardar — reemplaza todos los dominios con solo este
    await Tenant.updateOne(
      { slug: req.tenantSlug },
      { $set: { dominios: [dominio] } }
    )
    return res.json({ ok: true, dominio })
  } catch (err) {
    console.error('[StoreConfig]', err.message)
    return res.status(500).json({ error: 'Error interno.' })
  }
}
