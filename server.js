import "dotenv/config"
import express from "express"
import cors from "cors"
import { conectarDB } from "./src/config/db.js"
import { requireAuth } from "./src/middleware/auth.middleware.js"
import authRoutes from "./src/routes/auth.routes.js"
import clienteRoutes from "./src/routes/cliente.routes.js"
import productoRoutes from "./src/routes/producto.routes.js"
import audiovisualRoutes from "./src/routes/audiovisual.routes.js"
const app = express()

// CORS - permitir frontend en Vercel y desarrollo local
const corsOptions = {
  origin: [
    "https://miracle-front-jade.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000"
  ],
  optionsSuccessStatus: 200
}
app.use(cors(corsOptions))
app.use(express.json())

// Asegurar conexión a MongoDB antes de rutas que usan la DB
app.use(async (req, res, next) => {
  if (req.path === "/" || req.path === "/favicon.ico") return next()
  try {
    await conectarDB()
    next()
  } catch (err) {
    res.status(503).json({ error: "No se pudo conectar a la base de datos" })
  }
})

// Ruta raíz
app.get("/", (req, res) => {
  res.send("🚀 Backend Express funcionando")
})

// Auth (login, register) - sin protección
app.use("/auth", authRoutes)

// Rutas de datos protegidas por JWT o API key
app.use("/clientes", requireAuth, clienteRoutes)
app.use("/productos", requireAuth, productoRoutes)
app.use("/audiovisual", requireAuth, audiovisualRoutes)

// Puerto - solo para desarrollo local (Vercel usa serverless)
const PORT = process.env.PORT || 3000

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`🔥 Servidor escuchando en http://localhost:${PORT}`)
  })
}

export default app
