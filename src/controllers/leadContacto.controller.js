import LeadContacto from "../models/leadContacto.model.js"

function toLeadResponse(doc) {
  if (!doc) return null
  const o = doc.toObject ? doc.toObject() : doc
  return {
    id: o._id?.toString(),
    nombre: o.nombre,
    telefono: o.telefono,
    email: o.email,
    productoInteres: o.productoInteres,
    origen: o.origen,
    notas: o.notas,
    estado: o.estado,
    fechaCreacion: o.createdAt,
  }
}

export async function crearLead(req, res) {
  try {
    const { nombre, telefono, email, productoInteres, origen, notas } = req.body
    const nom = (nombre || "").trim()
    const tel = (telefono || "").trim()
    const em = (email ?? "").trim()
    const prod = (productoInteres || "").trim()
    const org = (origen || "whatsapp").trim() || "whatsapp"
    const nt = (notas ?? "").trim()

    if (!nom || !tel || !prod) {
      return res.status(400).json({
        error: "Campos obligatorios: nombre, telefono, productoInteres",
      })
    }

    const lead = await LeadContacto.create({
      nombre: nom,
      telefono: tel,
      email: em,
      productoInteres: prod,
      origen: org,
      notas: nt,
    })

    res.status(201).json(toLeadResponse(lead))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

