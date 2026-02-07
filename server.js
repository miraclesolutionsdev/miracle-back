import "dotenv/config"
import express from "express"
import cors from "cors"
import { conectarDB } from "./src/config/db.js"
import Usuario from "./src/models/usuario.model.js"

const app = express()

// Conectar a MongoDB
conectarDB()

// Middlewares
app.use(cors())
app.use(express.json())

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

// Puerto
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`🔥 Servidor escuchando en http://localhost:${PORT}`)
})
