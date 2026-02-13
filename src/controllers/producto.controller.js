import Producto from "../models/producto.model.js"
import mongoose from "mongoose"

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
  const imagenes = imagenesRaw.map((img, i) => {
    if (img?.data) {
      return { url: `productos/${id}/imagenes/${i}`, contentType: img.contentType || "image/jpeg" }
    }
    if (img?.url) return { url: img.url, contentType: img.contentType }
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
    let imagenes = []
    if (files.length > 0) {
      imagenes = files.map((f) => ({
        data: f.buffer,
        contentType: f.mimetype || "image/jpeg",
      }))
    } else if (req.body.imagenes && Array.isArray(req.body.imagenes)) {
      imagenes = req.body.imagenes.map((url) => ({
        url: typeof url === "string" ? url : url.url || "",
      }))
    }
    const producto = await Producto.create({
      nombre,
      descripcion: descripcion ?? "",
      precio: parsePrecio(precio),
      tipo: tipo === "producto" ? "producto" : "servicio",
      estado: estado === "inactivo" ? "inactivo" : "activo",
      imagenes,
      stock: Math.max(0, Number(stock) || 0),
      usos: parseJsonArray(usos),
      caracteristicas: parseJsonArray(caracteristicas),
    })
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
    if (nombre !== undefined) update.nombre = nombre
    if (descripcion !== undefined) update.descripcion = descripcion
    if (precio !== undefined) update.precio = parsePrecio(precio)
    if (tipo !== undefined && ["servicio", "producto"].includes(tipo)) update.tipo = tipo
    if (estado !== undefined && ["activo", "inactivo"].includes(estado)) update.estado = estado
    if (files.length > 0) {
      update.imagenes = files.map((f) => ({
        data: f.buffer,
        contentType: f.mimetype || "image/jpeg",
      }))
    } else if (req.body.imagenes !== undefined && Array.isArray(req.body.imagenes)) {
      update.imagenes = req.body.imagenes.map((url) => ({
        url: typeof url === "string" ? url : url.url || "",
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
    if (!producto) return res.status(404).json({ error: "Producto no encontrado" })
    const i = parseInt(index, 10)
    if (Number.isNaN(i) || i < 0 || !Array.isArray(producto.imagenes) || !producto.imagenes[i]) {
      return res.status(404).json({ error: "Imagen no encontrada" })
    }
    const img = producto.imagenes[i]
    if (!img?.data) {
      return res.status(404).json({ error: "Imagen no encontrada" })
    }
    res.set("Content-Type", img.contentType || "image/jpeg")
    res.set("Cache-Control", "public, max-age=86400")
    res.send(img.data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
