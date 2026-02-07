import mongoose from "mongoose"

export const conectarDB = async () => {
  try {
    if (mongoose.connection.readyState === 1) return
    await mongoose.connect(process.env.MONGODB_URI)
    console.log("✅ MongoDB conectado")
  } catch (error) {
    console.error("❌ Error al conectar MongoDB:", error.message)
    if (process.env.VERCEL !== "1") {
      process.exit(1)
    }
  }
}
