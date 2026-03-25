import mongoose from "mongoose"

const campanaSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
    },
    producto: { type: String, trim: true, default: "" },
    piezaCreativo: { type: String, trim: true, default: "" },
    plataforma: { type: String, trim: true, default: "" },
    miracleCoins: { type: Number, default: 0, min: 0 },
    estado: {
      type: String,
      enum: ["borrador", "activa", "pausada", "finalizada"],
      default: "borrador",
    },
  },
  { timestamps: true, collection: "campanas" }
)

export default mongoose.model("Campana", campanaSchema)
