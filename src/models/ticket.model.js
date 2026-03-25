import mongoose from 'mongoose'

/**
 * Modelo Ticket - Registro de eventos/cambios en una Orden
 * Permite auditoría completa del ciclo de vida de la orden
 * Tipos: creacion, pago_recibido, procesamiento_inicio, envio, entrega, problema, cancelacion, actualización
 */
const ticketSchema = new mongoose.Schema(
  {
    numeroTicket: {
      type: String,
      required: true,
      unique: true,
    },
    ordenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Orden',
      required: true,
    },
    tipo: {
      type: String,
      enum: [
        'creacion',
        'pago_recibido',
        'procesamiento_inicio',
        'envio',
        'entrega',
        'problema',
        'cancelacion',
        'actualización',
      ],
      required: true,
    },
    descripcion: {
      type: String,
      required: true,
    },
    cambios: {
      campo: String,
      valorAnterior: String,
      valorNuevo: String,
    },
    creador: {
      type: String,
      default: 'sistema',
    },
  },
  { timestamps: true, collection: 'tickets' }
)

// Índices para búsquedas
ticketSchema.index({ ordenId: 1, createdAt: -1 })
ticketSchema.index({ createdAt: -1 })

export default mongoose.model('Ticket', ticketSchema)
