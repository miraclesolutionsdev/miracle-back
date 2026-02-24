import jwt from "jsonwebtoken"
import Tenant from "../models/tenant.model.js"

const JWT_SECRET = process.env.JWT_SECRET || "tu-clave-secreta-cambiar-en-produccion"

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET)
      req.userId = decoded.userId
      req.tenantId = decoded.tenantId
      return next()
    } catch (e) {
      // no es JWT válido, probar como API key de tenant
    }
  }

  const apiKey = token || req.headers["x-tenant-key"]
  if (apiKey) {
    const tenant = await Tenant.findOne({ apiKey: apiKey.trim() })
    if (tenant) {
      req.tenantId = tenant._id.toString()
      return next()
    }
  }

  return res.status(401).json({ error: "No autorizado. Inicia sesión o usa una API key válida." })
}
