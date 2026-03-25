import mongoose from "mongoose"

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "El email es obligatorio"],
      trim: true,
      lowercase: true,
    },
    password: { type: String, required: [true, "La contraseña es obligatoria"], select: false },
    nombre: { type: String, trim: true, default: "" },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
    },
    activo: { type: Boolean, default: true },
    isOriginalAdmin: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "users" }
)

userSchema.index({ email: 1 }, { unique: true })

export default mongoose.model("User", userSchema)
