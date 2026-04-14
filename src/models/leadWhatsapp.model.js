import mongoose from 'mongoose';

const leadWhatsappSchema = new mongoose.Schema(
  {
    // ID único de la conversación desde ElevenLabs
    conversationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Agente de ElevenLabs que manejó la conversación
    agentId: {
      type: String,
      required: true,
    },
    // Estado de la conversación (done, in_progress, failed)
    status: {
      type: String,
      enum: ['done', 'in_progress', 'failed', 'other'],
      default: 'other',
    },
    // Timestamp de inicio (en segundos Unix)
    startTimeUnixSecs: {
      type: Number,
      default: null,
    },
    // Duración de la llamada en segundos
    callDurationSecs: {
      type: Number,
      default: 0,
    },
    // Cantidad de mensajes en la conversación
    messageCount: {
      type: Number,
      default: 0,
    },
    // Transcripción completa de la conversación
    transcript: {
      type: [
        {
          role: { type: String, enum: ['agent', 'user'] },
          message: String,
          time: Number,
        },
      ],
      default: [],
    },
    // Metadatos adicionales de ElevenLabs
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Número de teléfono del cliente (si está disponible)
    phoneNumber: {
      type: String,
      default: null,
    },
    // Si esta conversación generó una orden
    ordenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Orden',
      default: null,
    },
    // Estado del lead: nuevo, contactado, convertido, descartado
    estadoLead: {
      type: String,
      enum: ['nuevo', 'contactado', 'convertido', 'descartado'],
      default: 'nuevo',
    },
    // Notas del admin sobre este lead
    notas: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    collection: 'leads_whatsapp',
  }
);

// Índices para búsquedas comunes
leadWhatsappSchema.index({ status: 1, createdAt: -1 });
leadWhatsappSchema.index({ estadoLead: 1, createdAt: -1 });
leadWhatsappSchema.index({ phoneNumber: 1 });
leadWhatsappSchema.index({ startTimeUnixSecs: -1 });

export function getLeadWhatsappModel(db) {
  return db.models.LeadWhatsapp || db.model('LeadWhatsapp', leadWhatsappSchema);
}
