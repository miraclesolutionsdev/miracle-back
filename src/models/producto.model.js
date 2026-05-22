import mongoose from "mongoose"

const productoSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: [true, "El nombre del producto es obligatorio"],
      trim: true,
    },
    descripcion: { type: String, trim: true, default: "" },
    precio: { type: Number, required: true, min: 0 },
    precioDistribuidor: { type: Number, default: 0, min: 0 },
    aumentoPrecio: { type: Number, default: 0, min: 0 },
    utilidad: { type: Number, default: 30, min: 0, max: 100 },
    tipo: {
      type: String,
      enum: { values: ["servicio", "producto"], message: "Tipo no válido" },
      default: "producto",
    },
    estado: {
      type: String,
      enum: { values: ["activo", "inactivo"], message: "Estado no válido" },
      default: "activo",
    },
    imagenes: {
      type: [
        {
          url: { type: String, required: true },
          contentType: { type: String, default: "image/jpeg" },
        },
      ],
      default: [],
    },
    categoria: { type: String, trim: true, default: "" },
    subcategoria: { type: String, trim: true, default: "" },
    descuento: { type: Number, default: 0, min: 0, max: 100 },
    stock: { type: Number, default: 0, min: 0 },
    usos: { type: [String], default: [] },
    caracteristicas: { type: [String], default: [] },
    especificaciones: { type: [String], default: [] },
    incluye: { type: [String], default: [] },
  },
  { timestamps: true }
)

export function getProductoModel(db) {
  return db.models.Producto || db.model("Producto", productoSchema)
}
