import mongoose from 'mongoose'

const pagoSchema = new mongoose.Schema(
  {
    paymentId: { type: String, required: true, unique: true },
    productoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Producto', required: true },
    compradorNombre: { type: String, default: '' },
    compradorTelefono: { type: String, default: '' },
    monto: { type: Number },
    estado: { type: String, default: 'approved' },
  },
  { timestamps: true }
)

export default mongoose.model('Pago', pagoSchema)
