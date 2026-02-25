import mongoose from "mongoose"

const campanaSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    producto: { type: String, trim: true, default: "" },
    piezaCreativo: { type: String, trim: true, default: "" },
    plataforma: { type: String, trim: true, default: "" },
    miracleCoins: { type: String, trim: true, default: "" },
    estado: {
      type: String,
      enum: ["borrador", "activa", "pausada", "finalizada"],
      default: "borrador",
    },
  },
  { timestamps: true, collection: "campanas" }
)

export default mongoose.model("Campana", campanaSchema)
