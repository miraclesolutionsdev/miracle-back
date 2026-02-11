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
    tipo: {
      type: String,
      enum: { values: ["servicio", "producto"], message: "Tipo no válido" },
      default: "servicio",
    },
    estado: {
      type: String,
      enum: { values: ["activo", "inactivo"], message: "Estado no válido" },
      default: "activo",
    },
    imagenes: { type: [String], default: [] },
    stock: { type: Number, default: 0, min: 0 },
    usos: { type: [String], default: [] },
    caracteristicas: { type: [String], default: [] },
  },
  { timestamps: true }
)

export default mongoose.model("Producto", productoSchema)
