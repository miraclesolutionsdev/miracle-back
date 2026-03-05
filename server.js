import "dotenv/config"
import express from "express"
import cors from "cors"
import { conectarDB } from "./src/config/db.js"
import Usuario from "./src/models/usuario.model.js"
import clienteRoutes from "./src/routes/cliente.routes.js"
import productoRoutes from "./src/routes/producto.routes.js"
import audiovisualRoutes from "./src/routes/audiovisual.routes.js"
import authRoutes from "./src/routes/auth.routes.js"
import userRoutes from "./src/routes/user.routes.js"
import campanaRoutes from "./src/routes/campana.routes.js"
import iaRoutes from "./src/routes/ia.routes.js"

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

// POST - Crear usuario
app.post("/usuarios", async (req, res) => {
  try {
    const { nombre, contraseña, tel } = req.body
    if (!nombre || !contraseña || !tel) {
      return res.status(400).json({ error: "Faltan campos: nombre, contraseña, tel" })
    }
    const usuario = await Usuario.create({ nombre, contraseña, tel })
    res.status(201).json({
      id: usuario._id,
      nombre: usuario.nombre,
      contraseña: usuario.contraseña,
      tel: usuario.tel
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET - Listar todos los usuarios
app.get("/usuarios", async (req, res) => {
  try {
    const usuarios = await Usuario.find({}).sort({ createdAt: -1 })
    res.json(usuarios.map(u => ({
      id: u._id,
      nombre: u.nombre,
      contraseña: u.contraseña,
      tel: u.tel
    })))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
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

// Puerto - solo para desarrollo local (Vercel usa serverless)
const PORT = process.env.PORT || 3000

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`🔥 Servidor escuchando en http://localhost:${PORT}`)
  })
}

export default app
