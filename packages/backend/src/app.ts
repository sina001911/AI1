import { cors } from '@elysia/cors'
import { Elysia } from 'elysia'

import { authRoutes } from './routes/auth'
import { conversationsRoutes } from './routes/conversations'
import { creditsRoutes } from './routes/credits'
import { devicesRoutes } from './routes/devices'
import { verifyToken } from './utils/jwt'

export const app = (new Elysia() as any)
  .use(cors())
  .get('/health', () => ({ ok: true, service: 'ai1-backend', timestamp: Date.now() }))
  .use(authRoutes)
  .resolve((c: any) => {
    const auth = c.request.headers.get('Authorization')
    if (auth?.startsWith('Bearer ')) {
      const token = auth.slice(7)
      const payload = verifyToken(token)
      if (payload.valid && payload.payload) {
        return { userId: payload.payload.sub as string }
      }
    }
    return {}
  })
  .use(conversationsRoutes)
  .use(devicesRoutes)
  .use(creditsRoutes)
