import mongoose from "mongoose"

const piezaAudiovisualSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null },
    tipo: {
      type: String,
      enum: { values: ["Video", "Imagen"], message: "Tipo no válido" },
      required: true,
    },
    plataforma: { type: String, required: true, trim: true },
    formato: { type: String, default: "", trim: true },
    estado: {
      type: String,
      enum: { values: ["pendiente", "aprobada", "usada"], message: "Estado no válido" },
      default: "pendiente",
    },
    campanaAsociada: { type: String, trim: true, default: "" },
    url: { type: String, required: true },
    contentType: { type: String, default: "application/octet-stream" },
  },
  { timestamps: true, collection: "audiovisuales" }
)

export default mongoose.model("PiezaAudiovisual", piezaAudiovisualSchema)
