import mongoose from "mongoose"

// Una sola conexión TCP al cluster — múltiples DBs lógicas via useDb
let baseConn = null
const dbCache = new Map()

async function getBaseConnection() {
  if (baseConn && baseConn.readyState === 1) return baseConn

  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI no configurada")

  baseConn = await mongoose.createConnection(process.env.MONGODB_URI).asPromise()

  baseConn.on("error", (err) => {
    console.error("❌ Error en conexión base MongoDB:", err.message)
    baseConn = null
    dbCache.clear()
  })

  baseConn.on("disconnected", () => {
    console.warn("⚠️ Conexión base MongoDB desconectada")
    baseConn = null
    dbCache.clear()
  })

  console.log("✅ Conexión base a MongoDB establecida")
  return baseConn
}

/**
 * Devuelve una conexión lógica al DB indicado.
 * Reutiliza conexiones cacheadas — no abre sockets nuevos.
 */
export async function getDb(dbName) {
  const cached = dbCache.get(dbName)
  if (cached && cached.readyState === 1) return cached

  const base = await getBaseConnection()
  const db = base.useDb(dbName, { useCache: true })
  dbCache.set(dbName, db)
  return db
}

/** Conexión al DB de registro central de tenants */
export async function getRegistryDb() {
  return getDb("tenantregistrydb")
}
