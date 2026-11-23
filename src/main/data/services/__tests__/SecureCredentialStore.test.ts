import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from('encrypted:' + value),
    decryptString: (buffer: Buffer) => {
      const str = Buffer.from(buffer).toString()
      return str.startsWith('encrypted:') ? str.slice(10) : str
    }
  }
}))

import { SecureCredentialStore } from '../SecureCredentialStore'

describe('SecureCredentialStore', () => {
  const testStorageFile = join(__dirname, 'test-credentials.json')

  let store: SecureCredentialStore

  beforeEach(() => {
    store = new SecureCredentialStore({ storageFile: testStorageFile, enableFileFallback: true })
  })

  afterEach(() => {
    store.clear()
    // Clean up test file
    try {
      require('node:fs').unlinkSync(testStorageFile)
    } catch {
      // ignore
    }
    try {
      require('node:fs').unlinkSync(testStorageFile + '.tmp')
    } catch {
      // ignore
    }
  })

  it('set and get a credential value', () => {
    store.set('test.key', 'secret-value')
    expect(store.get('test.key')).toBe('secret-value')
  })

  it('returns undefined for missing key', () => {
    expect(store.get('missing.key')).toBeUndefined()
  })

  it('has returns true for existing key', () => {
    store.set('test.key', 'secret-value')
    expect(store.has('test.key')).toBe(true)
  })

  it('has returns false for missing key', () => {
    expect(store.has('missing.key')).toBe(false)
  })

  it('delete removes a key', () => {
    store.set('test.key', 'secret-value')
    expect(store.delete('test.key')).toBe(true)
    expect(store.has('test.key')).toBe(false)
    expect(store.delete('test.key')).toBe(false)
  })

  it('getAll returns all credentials', () => {
    store.set('key1', 'value1')
    store.set('key2', 'value2')
    const all = store.getAll()
    expect(all.key1).toBe('value1')
    expect(all.key2).toBe('value2')
  })

  it('clear removes all credentials', () => {
    store.set('key1', 'value1')
    store.set('key2', 'value2')
    store.clear()
    expect(store.getAll()).toEqual({})
  })

  it('isEncryptionAvailable returns a boolean', () => {
    const result = store.isEncryptionAvailable()
    expect(typeof result).toBe('boolean')
  })

  it('encrypt and decrypt round-trip', () => {
    const original = 'my-secret-key'
    const encrypted = store.encrypt(original)
    expect(encrypted).not.toBe(original)
    expect(store.decrypt(encrypted)).toBe(original)
  })

  it('decrypt returns plaintext for non-ciphertext input', () => {
    const plaintext = 'just-plain-text'
    expect(store.decrypt(plaintext)).toBe(plaintext)
  })

  it('persists data across store instances', () => {
    store.set('persist.key', 'persist-value')
    const store2 = new SecureCredentialStore({ storageFile: testStorageFile, enableFileFallback: true })
    expect(store2.get('persist.key')).toBe('persist-value')
    store2.clear()
  })

  it('overwrites existing key value', () => {
    store.set('test.key', 'value1')
    store.set('test.key', 'value2')
    expect(store.get('test.key')).toBe('value2')
  })
})
