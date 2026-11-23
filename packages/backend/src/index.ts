import { app } from './app'
import { database } from './db/index'

const PORT = Number(process.env.PORT) || 3001
const HOST = process.env.HOST ?? '0.0.0.0'

const server = app.listen({ port: PORT, hostname: HOST })

console.log(`AI1 Backend listening on http://${HOST}:${PORT}`)

// Graceful shutdown
process.on('SIGTERM', () => {
  server.stop()
  database.close()
  process.exit(0)
})

process.on('SIGINT', () => {
  server.stop()
  database.close()
  process.exit(0)
})
