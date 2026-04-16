import "dotenv/config"

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
import { tenantMiddleware } from "./src/middleware/tenant.middleware.js"
import { webhookTenantMiddleware } from "./src/middleware/webhookTenant.middleware.js"
import authRoutes from "./src/routes/auth.routes.js"
import { loginGlobal } from "./src/controllers/auth.controller.js"
import storeConfigRoutes from "./src/routes/storeConfig.routes.js"
import { resolverPorDominio, infoTienda } from "./src/controllers/storeConfig.controller.js"
import userRoutes from "./src/routes/user.routes.js"
import clienteRoutes from "./src/routes/cliente.routes.js"
import productoRoutes from "./src/routes/producto.routes.js"
import audiovisualRoutes from "./src/routes/audiovisual.routes.js"
import campanaRoutes from "./src/routes/campana.routes.js"
import iaRoutes from "./src/routes/ia.routes.js"
import pagoRoutes from "./src/routes/pago.routes.js"
import ordenRoutes from "./src/routes/orden.routes.js"
import whatsappRoutes from "./src/routes/whatsapp.routes.js"
import registerRoutes from "./src/routes/register.routes.js"
import notificationRoutes from "./src/routes/notification.routes.js"
import { crearOrdenWhatsApp, recibirWebhookConversacion } from "./src/controllers/whatsapp.controller.js"

const app = express()
app.set("trust proxy", 1)

// CORS estático — todo vive en un solo dominio
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:3000",
  `https://${process.env.MAIN_DOMAIN || "miraclesolutions.com.co"}`,
  `https://www.${process.env.MAIN_DOMAIN || "miraclesolutions.com.co"}`,
])

app.use(async (req, res, next) => {
  const origin = req.headers.origin

  // Permitir orígenes fijos + cualquier dominio custom registrado en DB
  let allowed = origin && ALLOWED_ORIGINS.has(origin)

  if (!allowed && origin) {
    try {
      const { getRegistryDb } = await import("./src/config/connectionManager.js")
      const { getTenantModel } = await import("./src/models/tenant.model.js")
      const hostname = origin.replace(/^https?:\/\//, '').replace(/^www\./, '')
      const registryDb = await getRegistryDb()
      const Tenant = getTenantModel(registryDb)
      const tenant = await Tenant.findOne({ dominios: hostname }).lean()
      if (tenant) allowed = true
    } catch { /* si falla, no bloquear — continúa sin CORS header */ }
  }

  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Access-Control-Allow-Credentials", "true")
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS")
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, x-api-key, X-Tenant-Slug"
    )
    res.setHeader("Vary", "Origin")
  }
  if (req.method === "OPTIONS") return res.status(200).end()
  next()
})

app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }))
app.use(cookieParser())
app.use(express.json({ limit: "10mb" }))

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: { error: "Demasiadas solicitudes. Intenta de nuevo en 15 minutos." },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, forwardedHeader: false },
  })
)

// Rutas públicas — sin tenant middleware
app.use("/register", registerRoutes)
app.post("/auth/login-global", loginGlobal)
app.get("/store-config/dominio", resolverPorDominio)
app.get("/store-config/info", infoTienda)
app.get("/", (_req, res) => res.send("🚀 Backend Miracle funcionando"))

// ══════════════════════════════════════════════════════════════
// WEBHOOKS PÚBLICOS (antes del tenantMiddleware global)
// ══════════════════════════════════════════════════════════════

// Webhook de conversaciones: ElevenLabs envía agent_id en el body automáticamente
app.post("/whatsapp/webhook/conversation", webhookTenantMiddleware, recibirWebhookConversacion)

// API crear orden: Tool de ElevenLabs envía X-Tenant-Slug en headers
app.post("/whatsapp/crear-orden", tenantMiddleware, crearOrdenWhatsApp)

// ══════════════════════════════════════════════════════════════
// RUTAS PROTEGIDAS (requieren X-Tenant-Slug header)
// ══════════════════════════════════════════════════════════════
app.use(tenantMiddleware)

app.use("/store-config", storeConfigRoutes)
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
app.use("/notificaciones", notificationRoutes)

const PORT = process.env.PORT || 3000
if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => console.log(`🔥 Servidor en http://localhost:${PORT}`))
}

export default app
