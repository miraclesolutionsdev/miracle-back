import mongoose from "mongoose"

let connectionPromise = null

export const conectarDB = async () => {
  if (mongoose.connection.readyState === 1) return
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGODB_URI)
  }
  try {
    await connectionPromise
    if (mongoose.connection.readyState === 1) {
      console.log("✅ MongoDB conectado")
    }
  } catch (error) {
    console.error("❌ Error al conectar MongoDB:", error.message)
    connectionPromise = null
    if (process.env.VERCEL !== "1") {
      process.exit(1)
    }
    throw error
  }
}
