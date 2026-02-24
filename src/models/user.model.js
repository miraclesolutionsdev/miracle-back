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
      required: [true, "El tenant es obligatorio"],
    },
  },
  { timestamps: true, collection: "users" }
)

userSchema.index({ email: 1, tenantId: 1 }, { unique: true })

export default mongoose.model("User", userSchema)
