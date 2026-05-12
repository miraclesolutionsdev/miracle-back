import mongoose from "mongoose"

const tenantSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    dbName: { type: String, required: true, unique: true },
    nombre: { type: String, required: true, trim: true },
    // Dominios custom registrados (ej. "tiendazapatos.com.co")
    dominios: { type: [String], default: [] },
    // Plantilla visual de la tienda (luxury, fitness, minimal, food, modern, exclusive)
    plantilla: { type: String, default: 'luxury', enum: ['luxury', 'fitness', 'minimal', 'food', 'modern', 'exclusive'] },
    // ID del agente ElevenLabs propio de este tenant (opcional)
    elevenLabsAgentId: { type: String, default: null },
  },
  { timestamps: true, collection: "tenants" }
)

tenantSchema.index({ dominios: 1 })

export function getTenantModel(db) {
  return db.models.Tenant || db.model("Tenant", tenantSchema)
}
