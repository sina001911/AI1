import { database } from '../db/index'
import { hashPassword, verifyPassword, hashToken } from '../utils/hash'
import { signAccessToken, signRefreshToken, verifyToken } from '../utils/jwt'

export function registerUser(email: string, password: string): { userId: string } {
  const existing = database.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined

  if (existing) {
    throw new Error('USER_ALREADY_EXISTS')
  }

  const id = crypto.randomUUID()
  const passwordHash = hashPassword(password)
  const now = Date.now()

  database
    .prepare(
      `INSERT INTO users (id, email, password_hash, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, email, passwordHash, 1, now, now)

  return { userId: id }
}

export function loginUser(
  email: string,
  password: string,
  deviceId: string,
  devicePlatform: 'desktop' | 'android' | 'ios' | 'web',
  deviceName: string | null
): {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: number
  refreshTokenExpiresAt: number
  userId: string
} {
  const user = database.prepare('SELECT * FROM users WHERE email = ?').get(email) as
    | { id: string; isActive: number; passwordHash: string }
    | undefined

  if (!user || !user.isActive) {
    throw new Error('INVALID_CREDENTIALS')
  }

  const passwordOk = verifyPassword(password, user.passwordHash)
  if (!passwordOk) {
    throw new Error('INVALID_CREDENTIALS')
  }

  const now = Date.now()
  const accessTokenJti = crypto.randomUUID()
  const refreshTokenJti = crypto.randomUUID()

  const accessToken = signAccessToken(user.id, accessTokenJti)
  const refreshToken = signRefreshToken(user.id, refreshTokenJti)
  const accessTokenExpiresAt = now + 15 * 60 * 1000
  const refreshTokenExpiresAt = now + 7 * 24 * 60 * 60 * 1000

  const existingDevice = database.prepare('SELECT device_id FROM devices WHERE device_id = ?').get(deviceId) as
    | { device_id: string }
    | undefined

  if (!existingDevice) {
    database
      .prepare(
        `INSERT INTO devices (user_id, device_id, platform, name, last_seen_at, revoked_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(user.id, deviceId, devicePlatform, deviceName ?? null, now, null, now, now)
  } else {
    database
      .prepare(`UPDATE devices SET last_seen_at = ?, updated_at = ?, revoked_at = NULL WHERE device_id = ?`)
      .run(now, now, deviceId)
  }

  database
    .prepare(
      `INSERT INTO sessions (user_id, device_id, access_token_jti, refresh_token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(user.id, deviceId, accessTokenJti, hashToken(refreshToken), new Date(refreshTokenExpiresAt).getTime(), now)

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    userId: user.id
  }
}

export function refreshTokens(refreshToken: string): {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: number
  refreshTokenExpiresAt: number
  userId: string
} {
  const payload = verifyToken(refreshToken)
  if (!payload.valid || !payload.payload || payload.payload.type !== 'refresh') {
    throw new Error('INVALID_REFRESH_TOKEN')
  }

  const userId = payload.payload.sub as string
  const tokenHash = hashToken(refreshToken)

  const session = database.prepare('SELECT * FROM sessions WHERE refresh_token_hash = ?').get(tokenHash) as
    | { id: string; device_id: string; expires_at: number }
    | undefined

  if (!session) {
    throw new Error('SESSION_NOT_FOUND')
  }

  if (Date.now() > session.expires_at) {
    throw new Error('SESSION_EXPIRED')
  }

  // Rotate: delete old session, create new one
  database.prepare('DELETE FROM sessions WHERE id = ?').run(session.id)

  const now = Date.now()
  const accessTokenJti = crypto.randomUUID()
  const refreshTokenJti = crypto.randomUUID()

  const accessToken = signAccessToken(userId, accessTokenJti)
  const newRefreshToken = signRefreshToken(userId, refreshTokenJti)
  const accessTokenExpiresAt = now + 15 * 60 * 1000
  const refreshTokenExpiresAt = now + 7 * 24 * 60 * 60 * 1000

  database
    .prepare(
      `INSERT INTO sessions (user_id, device_id, access_token_jti, refresh_token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      session.device_id,
      accessTokenJti,
      hashToken(newRefreshToken),
      new Date(refreshTokenExpiresAt).getTime(),
      now
    )

  return {
    accessToken,
    refreshToken: newRefreshToken,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    userId
  }
}

export function logoutUser(refreshToken: string): void {
  const payload = verifyToken(refreshToken)
  if (payload.valid && payload.payload) {
    const tokenHash = hashToken(refreshToken)
    database.prepare('DELETE FROM sessions WHERE refresh_token_hash = ?').run(tokenHash)
  }
}

export function revokeDevice(userId: string, deviceId: string): void {
  database
    .prepare(`UPDATE devices SET revoked_at = ? WHERE device_id = ? AND user_id = ?`)
    .run(Date.now(), deviceId, userId)

  database.prepare(`DELETE FROM sessions WHERE device_id = ? AND user_id = ?`).run(deviceId, userId)
}
