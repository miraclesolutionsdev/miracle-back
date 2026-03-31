import "dotenv/config"

// Validar variables de entorno críticas al arrancar
const REQUIRED_ENV = ["JWT_SECRET", "MONGODB_URI", "MP_ACCESS_TOKEN", "FRONT_URL"]
const missing = REQUIRED_ENV.filter((k) => !process.env[k])
if (missing.length) {
  console.error(`❌ Variables de entorno faltantes: ${missing.join(", ")}`)
  process.exit(1)
}

import express from "express"
import cookieParser from "cookie-parser"
import helmet from "helmet"
import rateLimit from "express-rate-limit"
import { conectarDB } from "./src/config/db.js"
import clienteRoutes from "./src/routes/cliente.routes.js"
import productoRoutes from "./src/routes/producto.routes.js"
import audiovisualRoutes from "./src/routes/audiovisual.routes.js"
import authRoutes from "./src/routes/auth.routes.js"
import userRoutes from "./src/routes/user.routes.js"
import campanaRoutes from "./src/routes/campana.routes.js"
import iaRoutes from "./src/routes/ia.routes.js"
import pagoRoutes from "./src/routes/pago.routes.js"
import ordenRoutes from "./src/routes/orden.routes.js"

const app = express()

// Vercel corre detrás de un proxy - necesario para rate-limit y cookies
app.set("trust proxy", 1)

const ALLOWED_ORIGINS = [
  "https://miracle-front-jade.vercel.app",
  "https://www.miraclesolutions.com.co",
  "https://miraclesolutions.com.co",
  "http://localhost:5173",
  "http://localhost:3000",
]

// CORS manual - antes de todo para que cada respuesta (incluyendo errores) lleve los headers
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Access-Control-Allow-Credentials", "true")
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
    res.setHeader("Vary", "Origin")
  }
  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }
  next()
})

app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }))
app.use(cookieParser())
app.use(express.json({ limit: "10mb" }))

// Rate limit global: 300 req/15 min por IP (protege todos los endpoints)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: "Demasiadas solicitudes. Intenta de nuevo en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, forwardedHeader: false },
})
app.use(globalLimiter)

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
app.get("/", (_req, res) => {
  res.send("🚀 Backend Express funcionando")
})

// Auth & usuarios
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

// Puerto - solo para desarrollo local (Vercel usa serverless)
const PORT = process.env.PORT || 3000

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`🔥 Servidor escuchando en http://localhost:${PORT}`)
  })
}

export default app
