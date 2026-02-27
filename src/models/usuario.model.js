import mongoose from "mongoose"

const usuarioSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    contraseña: { type: String, required: true },
    tel: { type: String, trim: true },
  },
  { timestamps: true, collection: "usuarios" }
)

export default mongoose.model("Usuario", usuarioSchema)
