import mongoose from 'mongoose'

/**
 * Modelo Orden - Representa una compra de uno o más productos
 * Vinculada a un Cliente y generada automáticamente desde MercadoPago o manualmente
 * Estados: pendiente → procesando → completada → entregada | cancelada
 */
const ordenSchema = new mongoose.Schema(
  {
    ordenNumero: {
      type: String,
      required: true,
      unique: true,
    },
    clienteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cliente',
      required: true,
      index: true,
    },
    cliente: {
      nombre: { type: String, required: true },
      email: { type: String, default: '' },
      whatsapp: { type: String, default: '' },
    },
    productos: [
      {
        productoId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Producto',
          required: true,
        },
        productoNombre: { type: String, required: true },
        cantidad: { type: Number, required: true, min: 1 },
        precioUnitario: { type: Number, required: true },
        precioTotal: { type: Number, required: true }, // cantidad * precioUnitario
      },
    ],
    totalMonto: {
      type: Number,
      required: true,
      min: 0,
    },
    estado: {
      type: String,
      enum: ['pendiente', 'procesando', 'completada', 'entregada', 'cancelada'],
      default: 'pendiente',
    },
    metodoPago: {
      type: String,
      enum: ['mercadopago', 'manual'],
      default: 'manual',
    },
    pagoId: {
      type: String,
      sparse: true,
      unique: true,
      // MercadoPago payment ID
    },
    notas: {
      type: String,
      default: '',
    },
  },
  { timestamps: true, collection: 'ordenes' }
)

// Índices para búsquedas comunes
ordenSchema.index({ estado: 1, createdAt: -1 })
ordenSchema.index({ 'cliente.email': 1 })

export default mongoose.model('Orden', ordenSchema)
