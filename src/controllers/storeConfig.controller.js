import { getRegistryDb } from '../config/connectionManager.js'
import { getTenantModel } from '../models/tenant.model.js'

function formatTenant(tenant) {
  return {
    slug:             tenant.slug,
    nombre:           tenant.nombre,
    dominio:          tenant.dominios?.[0] || null,
    plantilla:        tenant.plantilla || 'luxury',
    // Visual
    logoUrl:          tenant.logoUrl || null,
    colorPrimario:    tenant.colorPrimario || null,
    colorSecundario:  tenant.colorSecundario || null,
    colorTexto:       tenant.colorTexto || null,
    // Info pública
    descripcion:      tenant.descripcion || null,
    tagline:          tenant.tagline || null,
    telefono:         tenant.telefono || null,
    email:            tenant.email || null,
    direccion:        tenant.direccion || null,
    // Redes sociales
    instagram:        tenant.instagram || null,
    whatsapp:         tenant.whatsapp || null,
    facebook:         tenant.facebook || null,
    tiktok:           tenant.tiktok || null,
    // Envíos
    envioGratis:      tenant.envioGratis ?? false,
    montoEnvioGratis: tenant.montoEnvioGratis || null,
  }
}

/**
 * GET /store-config/info?slug=venompharmacol
 * Público. Retorna toda la configuración de la tienda del tenant.
 */
export async function infoTienda(req, res) {
  const slug = req.tenantSlug
    || (req.query.slug || '').trim().toLowerCase()
    || (req.headers['x-tenant-slug'] || '').trim().toLowerCase()
  if (!slug) return res.status(400).json({ error: 'Falta el parámetro slug.' })
  try {
    const registryDb = await getRegistryDb()
    const Tenant = getTenantModel(registryDb)
    const tenant = await Tenant.findOne({ slug }).lean()
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado.' })
    return res.json(formatTenant(tenant))
  } catch (err) {
    console.error('[StoreConfig]', err.message)
    return res.status(500).json({ error: 'Error interno.' })
  }
}

/**
 * GET /store-config/dominio?hostname=venompharmacol.com
 * Público. Dado un hostname resuelve el tenant.
 */
export async function resolverPorDominio(req, res) {
  const hostname = (req.query.hostname || '').trim().toLowerCase().replace(/^www\./, '')
  if (!hostname) return res.status(400).json({ error: 'Falta el parámetro hostname.' })
  try {
    const registryDb = await getRegistryDb()
    const Tenant = getTenantModel(registryDb)
    const tenant = await Tenant.findOne({ dominios: hostname }).lean()
    if (!tenant) return res.status(404).json({ error: `No hay tenant registrado para "${hostname}".` })
    return res.json(formatTenant(tenant))
  } catch (err) {
    console.error('[StoreConfig]', err.message)
    return res.status(500).json({ error: 'Error interno.' })
  }
}

/**
 * PATCH /store-config/info
 * Protegido. El admin actualiza la información y personalización de su tienda.
 * Body: cualquier subconjunto de los campos editables.
 */
export async function guardarInfo(req, res) {
  const CAMPOS_PERMITIDOS = [
    'nombre', 'descripcion', 'tagline', 'telefono', 'email', 'direccion',
    'logoUrl', 'colorPrimario', 'colorSecundario', 'colorTexto',
    'instagram', 'whatsapp', 'facebook', 'tiktok',
    'envioGratis', 'montoEnvioGratis',
  ]

  const updates = {}
  for (const campo of CAMPOS_PERMITIDOS) {
    if (req.body[campo] !== undefined) {
      updates[campo] = req.body[campo]
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No se enviaron campos válidos para actualizar.' })
  }

  // Validar colores hex si vienen
  const hexRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/
  for (const campo of ['colorPrimario', 'colorSecundario', 'colorTexto']) {
    if (updates[campo] && !hexRegex.test(updates[campo])) {
      return res.status(400).json({ error: `${campo} debe ser un color hex válido (ej. #C8352B).` })
    }
  }

  try {
    const registryDb = await getRegistryDb()
    const Tenant = getTenantModel(registryDb)
    const tenant = await Tenant.findOneAndUpdate(
      { slug: req.tenantSlug },
      { $set: updates },
      { new: true }
    ).lean()
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado.' })
    return res.json({ ok: true, config: formatTenant(tenant) })
  } catch (err) {
    console.error('[StoreConfig]', err.message)
    return res.status(500).json({ error: 'Error interno.' })
  }
}

/**
 * PATCH /store-config/plantilla
 * Protegido. El admin elige la plantilla visual de su tienda.
 */
export async function guardarPlantilla(req, res) {
  const plantilla = (req.body.plantilla || '').trim().toLowerCase()
  const validas = ['luxury', 'fitness', 'minimal', 'food', 'modern', 'exclusive']
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
 */
export async function guardarDominio(req, res) {
  const dominio = (req.body.dominio || '').trim().toLowerCase().replace(/^www\./, '')
  if (!dominio) return res.status(400).json({ error: 'Falta el campo dominio.' })
  try {
    const registryDb = await getRegistryDb()
    const Tenant = getTenantModel(registryDb)
    const existente = await Tenant.findOne({ dominios: dominio, slug: { $ne: req.tenantSlug } }).lean()
    if (existente) return res.status(409).json({ error: `El dominio "${dominio}" ya está en uso.` })
    await Tenant.updateOne({ slug: req.tenantSlug }, { $set: { dominios: [dominio] } })
    return res.json({ ok: true, dominio })
  } catch (err) {
    console.error('[StoreConfig]', err.message)
    return res.status(500).json({ error: 'Error interno.' })
  }
}
