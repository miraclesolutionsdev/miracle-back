import mongoose from 'mongoose'

/**
 * Modelo Contador para generar números de orden secuenciales
 * Permite auto-increment diario sin depender de ObjectId
 * Ej: 20250324-001, 20250324-002, ..., 20250324-099
 */
const contadorSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'ordenNumero' },
    fecha: { type: String, required: true }, // YYYYMMDD
    contador: { type: Number, default: 0 },
  },
  { timestamps: false, _id: false }
)

export default mongoose.model('Contador', contadorSchema)
