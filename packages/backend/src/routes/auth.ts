import { Elysia } from 'elysia'

import { registerUser, loginUser, refreshTokens, logoutUser, revokeDevice } from '../services/auth.service'

export const authRoutes = (new Elysia({ prefix: '/v1/auth' }) as any)
  .post('/register', ({ body }: any) => {
    const { email, password } = body as { email: string; password: string }
    const { userId } = registerUser(email, password)
    return { ok: true, data: { userId }, error: null, meta: { requestId: crypto.randomUUID(), timestamp: Date.now() } }
  })
  .post('/login', ({ body }: any) => {
    const { email, password, deviceId, devicePlatform, deviceName } = body as {
      email: string
      password: string
      deviceId: string
      devicePlatform: 'desktop' | 'android' | 'ios' | 'web'
      deviceName?: string | null
    }
    const result = loginUser(email, password, deviceId, devicePlatform, deviceName ?? null)
    return {
      ok: true,
      data: result,
      error: null,
      meta: { requestId: crypto.randomUUID(), timestamp: Date.now() }
    }
  })
  .post('/refresh', ({ body }: any) => {
    const { refreshToken } = body as { refreshToken: string }
    const result = refreshTokens(refreshToken)
    return {
      ok: true,
      data: result,
      error: null,
      meta: { requestId: crypto.randomUUID(), timestamp: Date.now() }
    }
  })
  .post('/logout', ({ body }: any) => {
    const { refreshToken } = body as { refreshToken: string }
    logoutUser(refreshToken)
    return { ok: true, data: null, error: null, meta: { requestId: crypto.randomUUID(), timestamp: Date.now() } }
  })
  .delete('/devices/:deviceId', ({ params }: any) => {
    const { deviceId } = params as { deviceId: string }
    const userId = (this as any).context?.userId ?? 'unknown'
    revokeDevice(userId, deviceId)
    return { ok: true, data: null, error: null, meta: { requestId: crypto.randomUUID(), timestamp: Date.now() } }
  })
