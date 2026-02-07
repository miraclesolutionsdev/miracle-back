import express from "express"
import cors from "cors"

const app = express()

// Middlewares
app.use(cors())
app.use(express.json())

// Ruta raíz
app.get("/", (req, res) => {
  res.send("🚀 Backend Express funcionando")
})

// Puerto
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`🔥 Servidor escuchando en http://localhost:${PORT}`)
})