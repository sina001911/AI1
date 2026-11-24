import { verifyToken } from '../utils/jwt'

export function authMiddleware(c: any, next: () => any) {
  const auth = c.request.headers.get('Authorization')
  if (!auth || !auth.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' }
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const token = auth.slice(7)
  const payload = verifyToken(token)
  if (!payload.valid || !payload.payload) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  c.set('userId', payload.payload.sub as string)
  return next()
}
