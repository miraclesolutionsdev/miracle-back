import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET

/**
 * Verifica el JWT y valida que el tenant del token
 * coincida con el tenant resuelto por tenantMiddleware.
 */
export async function requireAuth(req, res, next) {
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

    if (!decoded.userId) {
      return res.status(401).json({ error: "Token malformado." })
    }

    // Seguridad multi-tenant: el token debe pertenecer al tenant activo
    if (decoded.tenantSlug && decoded.tenantSlug !== req.tenantSlug) {
      return res.status(403).json({ error: "Token no válido para este tenant." })
    }

    req.userId = decoded.userId
    next()
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado. Inicia sesión de nuevo." })
  }
}
