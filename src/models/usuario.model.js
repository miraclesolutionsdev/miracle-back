import mongoose from "mongoose"

const usuarioSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, "El nombre es obligatorio"],
    trim: true
  },
  contraseña: {
    type: String,
    required: [true, "La contraseña es obligatoria"]
  },
  tel: {
    type: String,
    required: [true, "El teléfono es obligatorio"],
    trim: true
  }
}, {
  timestamps: true
})

export default mongoose.model("Usuario", usuarioSchema)
