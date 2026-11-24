import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const SALT_LEN = 16
const KEY_LEN = 64

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LEN).toString('hex')
  const key = scryptSync(password, salt, KEY_LEN)
  return `${salt}:${key.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, keyHex] = stored.split(':')
  if (!salt || !keyHex) {
    return false
  }
  const key = Buffer.from(keyHex, 'hex')
  const inputKey = scryptSync(password, salt, KEY_LEN)
  return timingSafeEqual(key, inputKey)
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
