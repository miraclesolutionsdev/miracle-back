import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema(
  {
    tipo: { type: String, required: true },
    titulo: { type: String, required: true },
    mensaje: { type: String, required: true },
    leida: { type: Boolean, default: false },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

notificationSchema.index({ createdAt: -1 })
notificationSchema.index({ leida: 1, createdAt: -1 })

const modelCache = {}

export function getNotificationModel(db) {
  const key = db.name
  if (!modelCache[key]) {
    modelCache[key] = db.models?.Notification
      ? db.model('Notification')
      : db.model('Notification', notificationSchema)
  }
  return modelCache[key]
}
