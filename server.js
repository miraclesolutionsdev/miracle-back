import "dotenv/config"
import express from "express"
import cors from "cors"
import { conectarDB } from "./src/config/db.js"
import clienteRoutes from "./src/routes/cliente.routes.js"
import productoRoutes from "./src/routes/producto.routes.js"
import audiovisualRoutes from "./src/routes/audiovisual.routes.js"
import authRoutes from "./src/routes/auth.routes.js"
import userRoutes from "./src/routes/user.routes.js"
import campanaRoutes from "./src/routes/campana.routes.js"
import iaRoutes from "./src/routes/ia.routes.js"
import pagoRoutes from "./src/routes/pago.routes.js"
import ventaRoutes from "./src/routes/venta.routes.js"
import ordenRoutes from "./src/routes/orden.routes.js"

const app = express()

// CORS - permitir frontend en Vercel y desarrollo local
const corsOptions = {
  origin: [
    "https://miracle-front-jade.vercel.app",
    "https://www.miraclesolutions.com.co",
    "https://miraclesolutions.com.co",
    "http://localhost:5173",
    "http://localhost:3000"
  ],
  optionsSuccessStatus: 200
}
app.use(cors(corsOptions))
app.use(express.json({ limit: "10mb" }))

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

// Auth & usuarios (multi-tenant)
app.use("/auth", authRoutes)
app.use("/users", userRoutes)

// CRUD Clientes
app.use("/clientes", clienteRoutes)

// CRUD Productos
app.use("/productos", productoRoutes)

// Audiovisual
app.use("/audiovisual", audiovisualRoutes)

// Campañas
app.use("/campanas", campanaRoutes)

// IA (copys, ángulos, etc.)
app.use("/ia", iaRoutes)

// Pagos (MercadoPago)
app.use("/pagos", pagoRoutes)

// Órdenes
app.use("/ordenes", ordenRoutes)

// Ventas
app.use("/ventas", ventaRoutes)

// Puerto - solo para desarrollo local (Vercel usa serverless)
const PORT = process.env.PORT || 3000

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`🔥 Servidor escuchando en http://localhost:${PORT}`)
  })
}

export default app
