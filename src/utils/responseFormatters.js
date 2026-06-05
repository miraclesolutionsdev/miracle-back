export function toProductoResponse(doc) {
  if (!doc) return null
  const o = doc.toObject ? doc.toObject() : doc
  const imagenes = (Array.isArray(o.imagenes) ? o.imagenes : [])
    .map((img) => (img?.url ? { url: img.url, contentType: img.contentType || 'image/jpeg' } : null))
    .filter(Boolean)
  return {
    id: o._id?.toString(),
    nombre: o.nombre,
    descripcion: o.descripcion ?? '',
    precio: o.precio ?? 0,
    precioDistribuidor: o.precioDistribuidor ?? 0,
    aumentoPrecio: o.aumentoPrecio ?? 0,
    utilidad: o.utilidad ?? 30,
    tipo: o.tipo ?? 'producto',
    estado: o.estado ?? 'activo',
    imagenes,
    categoria: o.categoria ?? '',
    subcategoria: o.subcategoria ?? '',
    descuento: o.descuento ?? 0,
    stock: o.stock ?? 0,
    usos: Array.isArray(o.usos) ? o.usos : [],
    caracteristicas: Array.isArray(o.caracteristicas) ? o.caracteristicas : [],
    especificaciones: Array.isArray(o.especificaciones) ? o.especificaciones : [],
    incluye: Array.isArray(o.incluye) ? o.incluye : [],
    fechaCreacion: o.createdAt,
  }
}

export function toClienteResponse(doc) {
  if (!doc) return null
  const o = doc.toObject ? doc.toObject() : doc
  return {
    id: o._id?.toString(),
    nombreEmpresa: o.nombreEmpresa,
    cedulaNit: o.cedulaNit,
    email: o.email,
    whatsapp: o.whatsapp,
    direccion: o.direccion,
    ciudadBarrio: o.ciudadBarrio,
    estado: o.estado,
    miracleCoins: o.miracleCoins ?? 0,
    fechaCreacion: o.createdAt,
  }
}

export function toCampanaResponse(doc) {
  if (!doc) return null
  const o = doc.toObject ? doc.toObject() : doc
  return {
    id: o._id?.toString(),
    nombre: o.nombre ?? '',
    producto: o.producto ?? '',
    piezaCreativo: o.piezaCreativo ?? '',
    plataforma: o.plataforma ?? '',
    miracleCoins: o.miracleCoins ?? 0,
    estado: o.estado ?? 'borrador',
    createdAt: o.createdAt,
  }
}

export function toAudiovisualResponse(doc) {
  if (!doc) return null
  const o = doc.toObject ? doc.toObject() : doc
  return {
    id: o._id?.toString(),
    tipo: o.tipo,
    plataforma: o.plataforma,
    formato: o.formato ?? '',
    estado: o.estado ?? 'pendiente',
    campanaAsociada: o.campanaAsociada ?? '',
    url: o.url,
    contentType: o.contentType,
    fechaCreacion: o.createdAt,
  }
}

export function toArticuloResponse(doc) {
  if (!doc) return null
  const o = doc.toObject ? doc.toObject() : doc
  return {
    id: o._id?.toString(),
    titulo: o.titulo,
    extracto: o.extracto ?? '',
    contenido: o.contenido ?? '',
    imagenUrl: o.imagenUrl ?? '',
    imagenContentType: o.imagenContentType ?? 'image/jpeg',
    categoria: o.categoria ?? '',
    etiquetas: Array.isArray(o.etiquetas) ? o.etiquetas : [],
    estado: o.estado ?? 'borrador',
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  }
}
