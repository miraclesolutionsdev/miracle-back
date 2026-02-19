import mongoose from "mongoose"

const leadContactoSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: [true, "El nombre es obligatorio"],
      trim: true,
    },
    telefono: {
      type: String,
      required: [true, "El telefono es obligatorio"],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      default: "",
    },
    productoInteres: {
      type: String,
      required: [true, "El producto de interes es obligatorio"],
      trim: true,
    },
    origen: {
      type: String,
      trim: true,
      default: "whatsapp", // whatsapp, llamada_ia, etc.
    },
    notas: {
      type: String,
      trim: true,
      default: "",
    },
    estado: {
      type: String,
      trim: true,
      default: "nuevo", // nuevo, contactado, cerrado, etc.
    },
  },
  { timestamps: true },
)

export default mongoose.model("LeadContacto", leadContactoSchema)

