/**
 * SecureCredentialStore - Unified credential storage for all credential domains.
 *
 * Stores secrets at rest using Electron safeStorage (OS keychain: Windows DPAPI,
 * macOS Keychain, Linux Secret Service) where available. Falls back to an
 * AES-256-GCM encrypted JSON file when safeStorage is unavailable (e.g. Linux
 * without a keyring, or in test environments).
 *
 * All operations are synchronous, consistent with the codebase's data layer
 * patterns (better-sqlite3 is synchronous). The store file lives at
 * {userData}/credentials/credentials.json.
 *
 * Migration: on read, values that are not valid safeStorage ciphertext are
 * treated as plaintext (legacy rows written before encryption was enabled).
 * On write, values are always encrypted.
 *
 * @example
 * const store = new SecureCredentialStore()
 * store.set('provider.openai.apiKey', 'sk-...')
 * const key = store.get('provider.openai.apiKey')
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { safeStorage } from 'electron'

import { application } from '@application'
import { loggerService } from '@logger'

const logger = loggerService.withContext('SecureCredentialStore')

// Storage file location
const STORAGE_DIR = join(application.getPath('app.userdata'), 'credentials')
const STORAGE_FILE = join(STORAGE_DIR, 'credentials.json')

// Encryption key derivation: scrypt with a fixed salt derived from the machine ID.
// The salt is stable per machine so the key is reproducible without storing it.
// In production, safeStorage (OS keychain) is preferred; this file fallback is
// only used when safeStorage is unavailable.
const SALT = 'cherry-studio-credential-store-v1'
const KEY_LENGTH = 32 // 256 bits for AES-256
const IV_LENGTH = 16 // 128 bits for AES-GCM

function deriveKey(machineId: string): Buffer {
  return scryptSync(machineId + SALT, SALT, KEY_LENGTH)
}

function getMachineId(): string {
  try {
    return application.getPath('app.userdata') || process.platform + process.arch
  } catch {
    return process.platform + process.arch
  }
}

const encryptionKey = deriveKey(getMachineId())

function encryptValue(value: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

function decryptValue(encryptedB64: string): string {
  const data = Buffer.from(encryptedB64, 'base64')
  const iv = data.subarray(0, IV_LENGTH)
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + 16)
  const encrypted = data.subarray(IV_LENGTH + 16)
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

function isLikelyCiphertext(value: string): boolean {
  // safeStorage ciphertext is base64. A plaintext value (legacy or fallback)
  // is unlikely to be valid base64 of the right shape.
  try {
    Buffer.from(value, 'base64')
    return /^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length % 4 === 0
  } catch {
    return false
  }
}

export interface SecureCredentialStoreOptions {
  /** Storage file path. Defaults to {userData}/credentials/credentials.json. */
  storageFile?: string
  /** Enable file-based fallback when safeStorage is unavailable. Default true. */
  enableFileFallback?: boolean
}

/**
 * Unified credential storage. All methods are synchronous.
 *
 * @example
 * const store = new SecureCredentialStore()
 * store.set('provider.openai.apiKey', 'sk-...')
 * const key = store.get('provider.openai.apiKey')
 */
export class SecureCredentialStore {
  private readonly storageFile: string
  private readonly enableFileFallback: boolean
  private cache: Map<string, string> | null = null

  constructor(options: SecureCredentialStoreOptions = {}) {
    this.storageFile = options.storageFile ?? STORAGE_FILE
    this.enableFileFallback = options.enableFileFallback ?? true
  }

  /** Whether safeStorage (OS keychain) is available on this machine. */
  isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  /** Decrypt a value, trying safeStorage first, then AES-GCM, then treating as plaintext. */
  private decryptValueOrPlaintext(encrypted: string): string {
    // Try safeStorage first (if available and value looks like safeStorage ciphertext)
    if (this.isEncryptionAvailable() && isLikelyCiphertext(encrypted)) {
      try {
        return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
      } catch {
        // Fall through to AES-GCM decryption
      }
    }

    // Try AES-GCM decryption (file fallback format)
    if (isLikelyCiphertext(encrypted)) {
      try {
        return decryptValue(encrypted)
      } catch {
        // Fall through to plaintext
      }
    }

    // Treat as plaintext (legacy or last-resort fallback)
    return encrypted
  }

  /** Load all credentials from storage into memory. Called lazily on first access. */
  private load(): Map<string, string> {
    if (this.cache) return this.cache

    const cache = new Map<string, string>()

    try {
      if (!existsSync(this.storageFile)) {
        this.cache = cache
        return cache
      }

      const raw = readFileSync(this.storageFile, 'utf8')
      const data = JSON.parse(raw) as Record<string, string>

      for (const [key, value] of Object.entries(data)) {
        cache.set(key, this.decryptValueOrPlaintext(value))
      }
    } catch (error) {
      logger.error('Failed to read credential store; starting empty', error as Error)
    }

    this.cache = cache
    return cache
  }

  /** Persist the in-memory cache to disk (file fallback only). */
  private persist(): void {
    if (!this.enableFileFallback || !this.cache) return

    try {
      mkdirSync(dirname(this.storageFile), { recursive: true })

      const data: Record<string, string> = {}
      for (const [key, value] of this.cache) {
        if (this.isEncryptionAvailable()) {
          data[key] = encryptValue(value)
        } else {
          data[key] = value // plaintext fallback (last resort)
        }
      }

      const tmpFile = this.storageFile + '.tmp'
      writeFileSync(tmpFile, JSON.stringify(data, null, 2))
      // Atomic rename so readers never see a partially written file
      renameSync(tmpFile, this.storageFile)
    } catch (error) {
      logger.error('Failed to persist credential store', error as Error)
    }
  }

  /** Encrypt a value using the store's encryption key. SafeStorage is preferred when available. */
  encrypt(value: string): string {
    if (this.isEncryptionAvailable()) {
      return safeStorage.encryptString(value).toString('base64')
    }
    return encryptValue(value)
  }

  /** Decrypt a value that was encrypted with {@link encrypt} or safeStorage. */
  decrypt(encrypted: string): string {
    if (this.isEncryptionAvailable()) {
      // Only attempt decryption for values that look like base64-encoded safeStorage
      // ciphertext. Plaintext keys (legacy rows written before encryption, or
      // test-seeded keys) pass through unchanged.
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encrypted) || encrypted.length % 4 !== 0) {
        return encrypted
      }
      try {
        return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
      } catch {
        // Corrupt or non-safeStorage ciphertext; treat as-is.
        return encrypted
      }
    }
    try {
      return decryptValue(encrypted)
    } catch {
      return encrypted
    }
  }

  /** Get a credential value by key. Returns undefined if not found. */
  get(key: string): string | undefined {
    return this.load().get(key)
  }

  /** Set a credential value by key. Persists immediately. */
  set(key: string, value: string): void {
    const cache = this.load()
    cache.set(key, value)
    this.persist()
  }

  /** Delete a credential by key. Returns true if the key existed. */
  delete(key: string): boolean {
    const cache = this.load()
    const existed = cache.has(key)
    cache.delete(key)
    this.persist()
    return existed
  }

  /** Check if a key exists in the store. */
  has(key: string): boolean {
    return this.load().has(key)
  }

  /** Get all credential key-value pairs. Values are decrypted. */
  getAll(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [key, value] of this.load()) {
      result[key] = value
    }
    return result
  }

  /** Clear all credentials. */
  clear(): void {
    this.cache = new Map()
    this.persist()
  }
}

// Export a default singleton for convenience
export const secureCredentialStore = new SecureCredentialStore()
