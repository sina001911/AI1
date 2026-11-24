import { createHmac, timingSafeEqual } from 'node:crypto'

const SECRET = process.env.JWT_SECRET ?? 'change-me-in-production'
const ACCESS_TTL_MS = 15 * 60 * 1000 // 15 minutes
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function base64Url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): unknown {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4 !== 0) base64 += '='
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'))
}

function sign(payload: Record<string, unknown>, ttlMs: number): string {
  const now = Date.now()
  const header = base64Url({ alg: 'HS256', typ: 'JWT' })
  const body = base64Url({ ...payload, iat: now, exp: now + ttlMs })
  const signature = createHmac('sha256', SECRET)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `${header}.${body}.${signature}`
}

export function signAccessToken(userId: string, jti: string): string {
  return sign({ sub: userId, jti, type: 'access' }, ACCESS_TTL_MS)
}

export function signRefreshToken(userId: string, jti: string): string {
  return sign({ sub: userId, jti, type: 'refresh' }, REFRESH_TTL_MS)
}

export function verifyToken(token: string): { valid: boolean; payload?: Record<string, unknown> } {
  try {
    const [headerB64, bodyB64, sigB64] = token.split('.')
    if (!headerB64 || !bodyB64 || !sigB64) return { valid: false }

    const expected = createHmac('sha256', SECRET)
      .update(`${headerB64}.${bodyB64}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sigB64))) {
      return { valid: false }
    }

    const payload = base64UrlDecode(bodyB64) as Record<string, unknown>
    if (typeof payload.exp === 'number' && Date.now() > payload.exp) {
      return { valid: false }
    }

    return { valid: true, payload }
  } catch {
    return { valid: false }
  }
}

export { ACCESS_TTL_MS, REFRESH_TTL_MS }
