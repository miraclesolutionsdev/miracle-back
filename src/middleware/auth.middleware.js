import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET || "tu-clave-secreta-cambiar-en-produccion"

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: "No autorizado. Inicia sesión para continuar." })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.userId = decoded.userId
    return next()
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado. Inicia sesión de nuevo." })
  }
}
