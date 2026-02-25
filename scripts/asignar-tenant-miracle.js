/**
 * Migración: asigna al tenant "Miracle" todos los clientes, productos y
 * piezas audiovisuales que tengan tenantId null o sin definir.
 * Así Miracle vuelve a ver sus datos y el resto de tenants solo ven los suyos.
 *
 * Uso: node scripts/asignar-tenant-miracle.js
 * Requiere: MONGODB_URI en .env
 */
import "dotenv/config"
import mongoose from "mongoose"
import Tenant from "../src/models/tenant.model.js"
import Cliente from "../src/models/cliente.model.js"
import Producto from "../src/models/producto.model.js"
import PiezaAudiovisual from "../src/models/piezaAudiovisual.model.js"
import Campana from "../src/models/campana.model.js"

async function run() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error("Falta MONGODB_URI en .env")
    process.exit(1)
  }
  await mongoose.connect(uri)
  console.log("Conectado a MongoDB")

  const tenant = await Tenant.findOne({ slug: "miracle" })
  if (!tenant) {
    console.error("No existe el tenant con slug 'miracle'. Ejecuta antes: node scripts/seed-tenant-and-user.js")
    await mongoose.disconnect()
    process.exit(1)
  }

  const filter = { $or: [{ tenantId: null }, { tenantId: { $exists: false } }] }
  const update = { $set: { tenantId: tenant._id } }

  const rClientes = await Cliente.updateMany(filter, update)
  const rProductos = await Producto.updateMany(filter, update)
  const rPiezas = await PiezaAudiovisual.updateMany(filter, update)
  const rCampanas = await Campana.updateMany(filter, update)

  console.log("Asignados al tenant Miracle:")
  console.log("  Clientes:", rClientes.modifiedCount, "actualizados")
  console.log("  Productos:", rProductos.modifiedCount, "actualizados")
  console.log("  Piezas audiovisuales:", rPiezas.modifiedCount, "actualizados")
  console.log("  Campanas:", rCampanas.modifiedCount, "actualizados")
  console.log("\nListo. Inicia sesión en Miracle para ver los datos.")

  await mongoose.disconnect()
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
