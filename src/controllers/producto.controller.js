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
  return {
    id: o._id?.toString(),
    nombre: o.nombre,
    descripcion: o.descripcion ?? "",
    precio: o.precio ?? 0,
    tipo: o.tipo ?? "servicio",
    estado: o.estado ?? "activo",
    imagenes: Array.isArray(o.imagenes) ? o.imagenes : [],
    stock: o.stock ?? 0,
    usos: Array.isArray(o.usos) ? o.usos : [],
    caracteristicas: Array.isArray(o.caracteristicas) ? o.caracteristicas : [],
    fechaCreacion: o.createdAt,
  }
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
    const { nombre, descripcion, precio, tipo, estado, imagenes, stock, usos, caracteristicas } = req.body
    if (!nombre) {
      return res.status(400).json({ error: "Faltan campos requeridos: nombre" })
    }
    const producto = await Producto.create({
      nombre,
      descripcion: descripcion ?? "",
      precio: parsePrecio(precio),
      tipo: tipo === "producto" ? "producto" : "servicio",
      estado: estado === "inactivo" ? "inactivo" : "activo",
      imagenes: Array.isArray(imagenes) ? imagenes : [],
      stock: Math.max(0, Number(stock) || 0),
      usos: Array.isArray(usos) ? usos : [],
      caracteristicas: Array.isArray(caracteristicas) ? caracteristicas : [],
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
    const { nombre, descripcion, precio, tipo, estado, imagenes, stock, usos, caracteristicas } = req.body
    const update = {}
    if (nombre !== undefined) update.nombre = nombre
    if (descripcion !== undefined) update.descripcion = descripcion
    if (precio !== undefined) update.precio = parsePrecio(precio)
    if (tipo !== undefined && ["servicio", "producto"].includes(tipo)) update.tipo = tipo
    if (estado !== undefined && ["activo", "inactivo"].includes(estado)) update.estado = estado
    if (imagenes !== undefined) update.imagenes = Array.isArray(imagenes) ? imagenes : []
    if (stock !== undefined) update.stock = Math.max(0, Number(stock) || 0)
    if (usos !== undefined) update.usos = Array.isArray(usos) ? usos : []
    if (caracteristicas !== undefined) update.caracteristicas = Array.isArray(caracteristicas) ? caracteristicas : []

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
