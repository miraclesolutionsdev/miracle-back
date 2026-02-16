import Producto from "../models/producto.model.js"
import mongoose from "mongoose"
import { subirImagenEvitandoDuplicado } from "../services/s3.service.js"

function parsePrecio(val) {
  if (typeof val === "number" && !Number.isNaN(val)) return Math.max(0, val)
  if (typeof val === "string") {
    const num = Number(val.replace(/[^0-9.]/g, ""))
    return Number.isNaN(num) ? 0 : Math.max(0, num)
  }
  return 0
}

function toProductoResponse(doc) {
  if (!doc) return null
  const o = doc.toObject ? doc.toObject() : doc
  const id = o._id?.toString()
  const imagenesRaw = Array.isArray(o.imagenes) ? o.imagenes : []
  const imagenes = imagenesRaw.map((img) => {
    if (img?.url) return { url: img.url, contentType: img.contentType || "image/jpeg" }
    return null
  }).filter(Boolean)
  return {
    id,
    nombre: o.nombre,
    descripcion: o.descripcion ?? "",
    precio: o.precio ?? 0,
    tipo: o.tipo ?? "servicio",
    estado: o.estado ?? "activo",
    imagenes,
    stock: o.stock ?? 0,
    usos: Array.isArray(o.usos) ? o.usos : [],
    caracteristicas: Array.isArray(o.caracteristicas) ? o.caracteristicas : [],
    fechaCreacion: o.createdAt,
  }
}

function parseJsonArray(val) {
  if (Array.isArray(val)) return val
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return val.split("\n").map((s) => s.trim()).filter(Boolean)
    }
  }
  return []
}

export async function listarTodos(req, res) {
  try {
    const { estado, tipo } = req.query
    const filter = {}
    if (estado) filter.estado = estado
    if (tipo) filter.tipo = tipo
    const productos = await Producto.find(filter).sort({ createdAt: -1 })
    res.json(productos.map(toProductoResponse))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function obtenerUno(req, res) {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID de producto no válido" })
    }
    const producto = await Producto.findById(id)
    if (!producto) return res.status(404).json({ error: "Producto no encontrado" })
    res.json(toProductoResponse(producto))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function crear(req, res) {
  try {
    const { nombre, descripcion, precio, tipo, estado, stock, usos, caracteristicas } = req.body
    const files = req.files || []
    if (!nombre) {
      return res.status(400).json({ error: "Faltan campos requeridos: nombre" })
    }
    const nom = (nombre || "").trim()
    const existente = await Producto.findOne({ nombre: nom })
    if (existente) {
      return res.status(409).json({
        error: "Ya existe un producto o servicio con ese nombre.",
      })
    }
    let imagenes = []
    if (req.body.imagenes && Array.isArray(req.body.imagenes) && files.length === 0) {
      imagenes = req.body.imagenes.map((url) => ({
        url: typeof url === "string" ? url : url.url || "",
        contentType: (typeof url === "object" && url?.contentType) ? url.contentType : "image/jpeg",
      }))
    }
    const producto = await Producto.create({
      nombre: nom,
      descripcion: descripcion ?? "",
      precio: parsePrecio(precio),
      tipo: tipo === "producto" ? "producto" : "servicio",
      estado: estado === "inactivo" ? "inactivo" : "activo",
      imagenes,
      stock: Math.max(0, Number(stock) || 0),
      usos: parseJsonArray(usos),
      caracteristicas: parseJsonArray(caracteristicas),
    })
    if (files.length > 0) {
      const urlsSubidas = []
      for (const f of files) {
        const url = await subirImagenEvitandoDuplicado(
          f.buffer,
          f.mimetype || "image/jpeg",
          f.originalname || "imagen.jpg"
        )
        urlsSubidas.push({ url, contentType: f.mimetype || "image/jpeg" })
      }
      producto.imagenes = urlsSubidas
      await producto.save()
    }
    res.status(201).json(toProductoResponse(producto))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function actualizar(req, res) {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID de producto no válido" })
    }
    const { nombre, descripcion, precio, tipo, estado, stock, usos, caracteristicas } = req.body
    const files = req.files || []
    const update = {}
    if (nombre !== undefined) update.nombre = (nombre || "").trim()
    if (descripcion !== undefined) update.descripcion = descripcion

    if (update.nombre !== undefined) {
      const otro = await Producto.findOne({
        nombre: update.nombre,
        _id: { $ne: id },
      })
      if (otro) {
        return res.status(409).json({
          error: "Ya existe un producto o servicio con ese nombre.",
        })
      }
    }
    if (precio !== undefined) update.precio = parsePrecio(precio)
    if (tipo !== undefined && ["servicio", "producto"].includes(tipo)) update.tipo = tipo
    if (estado !== undefined && ["activo", "inactivo"].includes(estado)) update.estado = estado
    if (files.length > 0) {
      const productoActual = await Producto.findById(id).select("imagenes").lean()
      const imagenesExistentes = Array.isArray(productoActual?.imagenes)
        ? productoActual.imagenes.filter((img) => img?.url).map((img) => ({ url: img.url, contentType: img.contentType || "image/jpeg" }))
        : []
      const nuevasUrls = []
      for (const f of files) {
        const url = await subirImagenEvitandoDuplicado(
          f.buffer,
          f.mimetype || "image/jpeg",
          f.originalname || "imagen.jpg"
        )
        nuevasUrls.push({ url, contentType: f.mimetype || "image/jpeg" })
      }
      update.imagenes = [...imagenesExistentes, ...nuevasUrls]
    } else if (req.body.imagenes !== undefined && Array.isArray(req.body.imagenes)) {
      update.imagenes = req.body.imagenes.map((url) => ({
        url: typeof url === "string" ? url : url.url || "",
        contentType: (typeof url === "object" && url?.contentType) ? url.contentType : "image/jpeg",
      }))
    }
    if (stock !== undefined) update.stock = Math.max(0, Number(stock) || 0)
    if (usos !== undefined) update.usos = parseJsonArray(usos)
    if (caracteristicas !== undefined) update.caracteristicas = parseJsonArray(caracteristicas)

    const producto = await Producto.findByIdAndUpdate(id, update, { new: true })
    if (!producto) return res.status(404).json({ error: "Producto no encontrado" })
    res.json(toProductoResponse(producto))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function inactivar(req, res) {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID de producto no válido" })
    }
    const producto = await Producto.findByIdAndUpdate(id, { estado: "inactivo" }, { new: true })
    if (!producto) return res.status(404).json({ error: "Producto no encontrado" })
    res.json(toProductoResponse(producto))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function obtenerImagen(req, res) {
  try {
    const { id, index } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "ID de producto no válido" })
    }
    const producto = await Producto.findById(id).select("imagenes")
    if (!producto) return res.status(404).json({ error: "Imagen no encontrada" })
    const i = parseInt(index, 10)
    if (Number.isNaN(i) || i < 0 || !Array.isArray(producto.imagenes) || !producto.imagenes[i]) {
      return res.status(404).json({ error: "Imagen no encontrada" })
    }
    const img = producto.imagenes[i]
    if (img?.url && (img.url.startsWith("http") || img.url.startsWith("//"))) {
      return res.redirect(302, img.url)
    }
    return res.status(404).json({ error: "Imagen no encontrada" })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
