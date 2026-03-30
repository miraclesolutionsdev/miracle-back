import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET

export async function requireAuth(req, res, next) {
  // Cookie HttpOnly tiene prioridad; Authorization header como fallback
  const token =
    req.cookies?.miracle_token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null)

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
