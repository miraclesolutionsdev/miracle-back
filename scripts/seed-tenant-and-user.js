/**
 * Script para crear un tenant por defecto y un usuario admin.
 * Uso: node scripts/seed-tenant-and-user.js
 * Requiere: MONGODB_URI y JWT_SECRET en .env (opcional).
 */
import "dotenv/config"
import mongoose from "mongoose"
import bcrypt from "bcrypt"
import Tenant from "../src/models/tenant.model.js"
import User from "../src/models/user.model.js"

const SALT_ROUNDS = 10
const DEFAULT_EMAIL = "admin@miracle.com"
const DEFAULT_PASSWORD = "admin123"
const DEFAULT_TENANT_NAME = "Miracle"

async function seed() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error("Falta MONGODB_URI en .env")
    process.exit(1)
  }
  await mongoose.connect(uri)
  console.log("Conectado a MongoDB")

  let tenant = await Tenant.findOne({ slug: "miracle" })
  if (!tenant) {
    tenant = await Tenant.create({
      nombre: DEFAULT_TENANT_NAME,
      slug: "miracle",
    })
    console.log("Tenant creado:", tenant.nombre, tenant._id)
  } else {
    console.log("Tenant ya existe:", tenant.nombre)
  }

  const emailNorm = DEFAULT_EMAIL.trim().toLowerCase()
  let user = await User.findOne({ email: emailNorm, tenantId: tenant._id }).select("+password")
  if (!user) {
    const hash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS)
    user = await User.create({
      email: emailNorm,
      password: hash,
      nombre: "Admin",
      tenantId: tenant._id,
    })
    console.log("Usuario creado:", user.email)
  } else {
    console.log("Usuario ya existe:", user.email)
  }

  console.log("\nPuedes iniciar sesión con:")
  console.log("  Email:", DEFAULT_EMAIL)
  console.log("  Contraseña:", DEFAULT_PASSWORD)
  await mongoose.disconnect()
  process.exit(0)
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
