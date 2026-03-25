import mongoose from 'mongoose'

const ventaSchema = new mongoose.Schema(
  {
    tenantId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
    ordenId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Orden', default: null },
    pagoId:          { type: String, required: true, unique: true },
    productoId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Producto', default: null },
    productoNombre:  { type: String, default: '' },
    monto:           { type: Number, required: true },
    estado:          { type: String, enum: ['aprobado', 'pendiente', 'fallido'], default: 'aprobado' },
    metodoPago:      { type: String, default: '' },
  },
  { timestamps: true }
)

export default mongoose.model('Venta', ventaSchema)