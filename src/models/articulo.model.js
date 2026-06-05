import mongoose from "mongoose"

const articuloSchema = new mongoose.Schema(
  {
    titulo: {
      type: String,
      required: [true, "El título del artículo es obligatorio"],
      trim: true,
    },
    extracto: { type: String, trim: true, default: "" },
    contenido: { type: String, default: "" },
    imagenUrl: { type: String, default: "" },
    imagenContentType: { type: String, default: "image/jpeg" },
    categoria: { type: String, trim: true, default: "" },
    etiquetas: { type: [String], default: [] },
    estado: {
      type: String,
      enum: { values: ["borrador", "publicado"], message: "Estado no válido" },
      default: "borrador",
    },
  },
  { timestamps: true }
)

export const getArticuloModel = (db) =>
  db.models.Articulo || db.model("Articulo", articuloSchema)
