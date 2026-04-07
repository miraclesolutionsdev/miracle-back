/**
 * Servicio SSE (Server-Sent Events) multi-tenant.
 * Mantiene un Map: tenantDbName → Set<res> con todas las conexiones abiertas.
 */

const connections = new Map()

export const sseService = {
  subscribe(tenantDbName, res) {
    if (!connections.has(tenantDbName)) connections.set(tenantDbName, new Set())
    connections.get(tenantDbName).add(res)
  },

  unsubscribe(tenantDbName, res) {
    connections.get(tenantDbName)?.delete(res)
  },

  /** Emite un evento a todos los clientes conectados del tenant */
  emit(tenantDbName, data) {
    const clients = connections.get(tenantDbName)
    if (!clients?.size) return
    const payload = `data: ${JSON.stringify(data)}\n\n`
    for (const res of clients) {
      try {
        res.write(payload)
      } catch {
        clients.delete(res)
      }
    }
  },

  clientCount(tenantDbName) {
    return connections.get(tenantDbName)?.size ?? 0
  },
}
