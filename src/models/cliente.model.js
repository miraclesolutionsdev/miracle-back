import mongoose from "mongoose"

const clienteSchema = new mongoose.Schema(
  {
    nombreEmpresa: {
      type: String,
      required: [true, "El nombre o empresa es obligatorio"],
      trim: true,
    },
    cedulaNit: { type: String, trim: true, default: "" },
    email: {
      type: String,
      required: [true, "El email es obligatorio"],
      trim: true,
    },
    whatsapp: { type: String, trim: true, default: "" },
    direccion: { type: String, trim: true, default: "" },
    ciudadBarrio: { type: String, trim: true, default: "" },
    estado: {
      type: String,
      enum: { values: ["activo", "pausado", "inactivo"], message: "Estado no válido" },
      default: "activo",
    },
    miracleCoins: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
)

export default mongoose.model("Cliente", clienteSchema)
