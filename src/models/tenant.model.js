import mongoose from "mongoose"

const tenantSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: [true, "El nombre del tenant es obligatorio"], trim: true },
    slug: { type: String, trim: true, unique: true, sparse: true },
    apiKey: { type: String, trim: true, default: null },
  },
  { timestamps: true, collection: "tenants" }
)

export default mongoose.model("Tenant", tenantSchema)
