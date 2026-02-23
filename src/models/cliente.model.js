import mongoose from "mongoose"

const clienteSchema = new mongoose.Schema(
  {
    nombreEmpresa: {
      type: String,
      required: [true, "El nombre o empresa es obligatorio"],
      trim: true,
    },
    cedulaNit: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "" },
    whatsapp: { type: String, trim: true, default: "" },
    direccion: { type: String, trim: true, default: "" },
    ciudadBarrio: { type: String, trim: true, default: "" },
    origen: {
      type: String,
      enum: ["plataforma", "whatsapp"],
      default: "plataforma",
    },
    productoInteres: { type: String, trim: true, default: "" },
    notas: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
)

export default mongoose.model("Cliente", clienteSchema)
