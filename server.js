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
import { getRegistryDb } from "./src/config/connectionManager.js"
import { getTenantModel } from "./src/models/tenant.model.js"
import { tenantMiddleware } from "./src/middleware/tenant.middleware.js"
import clienteRoutes from "./src/routes/cliente.routes.js"
import productoRoutes from "./src/routes/producto.routes.js"
import audiovisualRoutes from "./src/routes/audiovisual.routes.js"
import authRoutes from "./src/routes/auth.routes.js"
import userRoutes from "./src/routes/user.routes.js"
import campanaRoutes from "./src/routes/campana.routes.js"
import iaRoutes from "./src/routes/ia.routes.js"
import pagoRoutes from "./src/routes/pago.routes.js"
import ordenRoutes from "./src/routes/orden.routes.js"
import whatsappRoutes from "./src/routes/whatsapp.routes.js"
import registerRoutes from "./src/routes/register.routes.js"

const app = express()

app.set("trust proxy", 1)

// CORS dinámico: permite todos los dominios registrados en tenantregistrydb + los fijos
const STATIC_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
]

let _originsCache = null
let _originsCacheTs = 0
const ORIGINS_TTL = 30_000 // 30 segundos

async function getAllowedOrigins() {
  const now = Date.now()
  if (_originsCache && now - _originsCacheTs < ORIGINS_TTL) return _originsCache
  try {
    const db = await getRegistryDb()
    const Tenant = getTenantModel(db)
    const tenants = await Tenant.find({}).select("dominios").lean()
    // dominios[] ya incluye www.xxx si aplica — no duplicar con www.${d}
    const dynamicOrigins = tenants.flatMap((t) =>
      t.dominios.map((d) => `https://${d}`)
    )
    _originsCache = [...STATIC_ORIGINS, ...dynamicOrigins]
    _originsCacheTs = now
    return _originsCache
  } catch {
    return _originsCache ?? STATIC_ORIGINS
  }
}

app.use(async (req, res, next) => {
  const origin = req.headers.origin
  if (!origin) return next()
  const allowedOrigins = await getAllowedOrigins()
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Access-Control-Allow-Credentials", "true")
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key")
    res.setHeader("Vary", "Origin")
  }
  if (req.method === "OPTIONS") return res.status(200).end()
  next()
})

app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }))
app.use(cookieParser())
app.use(express.json({ limit: "10mb" }))

// Rate limit global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: "Demasiadas solicitudes. Intenta de nuevo en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, forwardedHeader: false },
})
app.use(globalLimiter)

// Ruta de registro — NO necesita tenantMiddleware (crea el tenant)
app.use("/register", registerRoutes)

// Ruta raíz
app.get("/", (_req, res) => res.send("🚀 Backend Express funcionando"))

// Todas las demás rutas resuelven el tenant por hostname
app.use(tenantMiddleware)

app.use("/auth", authRoutes)
app.use("/users", userRoutes)
app.use("/clientes", clienteRoutes)
app.use("/productos", productoRoutes)
app.use("/audiovisual", audiovisualRoutes)
app.use("/campanas", campanaRoutes)
app.use("/ia", iaRoutes)
app.use("/pagos", pagoRoutes)
app.use("/ordenes", ordenRoutes)
app.use("/whatsapp", whatsappRoutes)

const PORT = process.env.PORT || 3000

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`🔥 Servidor escuchando en http://localhost:${PORT}`)
  })
}

export default app
