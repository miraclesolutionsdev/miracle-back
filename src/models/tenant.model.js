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

    // Personalización visual de la tienda
    logoUrl:          { type: String, default: null },
    colorPrimario:    { type: String, default: null }, // hex, ej. "#C8352B"
    colorSecundario:  { type: String, default: null }, // hex, ej. "#F5F0EB"
    colorTexto:       { type: String, default: null }, // hex, ej. "#1A1A1A"

    // Información pública de la tienda
    descripcion:      { type: String, default: null, trim: true },
    tagline:          { type: String, default: null, trim: true }, // frase corta para el hero
    telefono:         { type: String, default: null, trim: true },
    email:            { type: String, default: null, trim: true, lowercase: true },
    direccion:        { type: String, default: null, trim: true },

    // Redes sociales
    instagram:        { type: String, default: null, trim: true }, // solo el handle, sin @
    whatsapp:         { type: String, default: null, trim: true }, // número con código de país
    facebook:         { type: String, default: null, trim: true }, // handle o URL
    tiktok:           { type: String, default: null, trim: true }, // handle sin @

    // Configuración de envíos
    envioGratis:      { type: Boolean, default: false },
    montoEnvioGratis: { type: Number, default: null }, // monto mínimo para envío gratis

    // ID del agente ElevenLabs propio de este tenant (opcional)
    elevenLabsAgentId: { type: String, default: null },
  },
  { timestamps: true, collection: "tenants" }
)

tenantSchema.index({ dominios: 1 })

export function getTenantModel(db) {
  return db.models.Tenant || db.model("Tenant", tenantSchema)
}
