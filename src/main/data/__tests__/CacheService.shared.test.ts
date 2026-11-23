import type { IpcMainEvent } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { application } from '@application'
/**
 * Tests for the shared-tier TTL synchronization contract (issue #17050).
 *
 * Covers:
 *  - fix A1: setShared treats expireAt as part of the entry state — an
 *    equal-value write whose TTL moved (add / extend / shorten / remove)
 *    broadcasts the full entry to renderer mirrors but never fires main
 *    value-subscribers; re-setting an EXPIRED entry with the same value is an
 *    absent → value transition (broadcast + subscriber fire).
 *  - fix A2: every Main-origin runtime eviction (getShared / hasShared / GC
 *    sweep / getAllShared / deleteShared-on-expired) physically deletes the
 *    entry and broadcasts exactly one deletion tombstone, so renderer mirrors
 *    (which have no GC of their own) converge; TTL cleanup never fires main
 *    value-subscribers.
 *  - boundaries: the renderer-origin relay path and onStop stay outside the
 *    unified eviction outlet (no double broadcast, no teardown broadcast).
 */
import { IpcChannel } from '@shared/IpcChannel'

// Undo the global mock from main.setup.ts — we want the REAL CacheService
vi.unmock('@main/data/CacheService')

// Mock lifecycle decorators so `new CacheService()` works without the container.
// The mocked BaseService captures ipcMain handlers and interval callbacks so
// tests can invoke the relay path and the GC sweep directly.
const ipcListeners = new Map<string, (event: IpcMainEvent, ...args: any[]) => void>()
const ipcHandlers = new Map<string, (event: IpcMainEvent, ...args: any[]) => unknown>()
const intervalCallbacks: Array<() => void> = []

vi.mock('@main/core/lifecycle', () => ({
  BaseService: class {
    protected ipcOn(channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void) {
      ipcListeners.set(channel, listener)
      return { dispose: () => ipcListeners.delete(channel) }
    }
    protected ipcHandle(channel: string, handler: (event: IpcMainEvent, ...args: any[]) => unknown) {
      ipcHandlers.set(channel, handler)
      return { dispose: () => ipcHandlers.delete(channel) }
    }
    protected registerDisposable(d: unknown) {
      return d
    }
    protected registerInterval(callback: () => void) {
      intervalCallbacks.push(callback)
      return { dispose: () => {} }
    }
    get isReady() {
      return true
    }
  },
  Injectable: () => () => {},
  ServicePhase: () => () => {},
  DependsOn: () => () => {},
  Phase: { BeforeReady: 'BeforeReady', WhenReady: 'WhenReady' }
}))

// JobManager's live keys — the standing consumer of TTL'd main-owned entries.
const STATE_KEY = 'jobs.state.job-1' as const
const PROGRESS_KEY = 'jobs.progress.job-1' as const

// Trusted sender shape for the in-handler source-trust gate (validateSender).
// On Windows, `file:///mock/app.root/index.html` is not a valid file URL
// (no drive letter) and fileURLToPath throws — use a Windows-style path.
// application.getPath('app.root') is overridden to match in beforeEach below.
const trustedEvent = {
  sender: { getType: () => 'window' },
  senderFrame: { url: 'file:///C:/mock/app.root/index.html', parent: null }
} as unknown as IpcMainEvent

const BASE = 1_000_000
const TTL = 60_000

describe('CacheService shared-tier TTL sync', () => {
  let service: any
  let send: ReturnType<typeof vi.fn<(...args: any[]) => any>>
  let now: number

  beforeEach(async () => {
    vi.clearAllMocks()
    ipcListeners.clear()
    ipcHandlers.clear()
    intervalCallbacks.length = 0

    now = BASE
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    const { BrowserWindow } = (await import('electron')) as any
    send = vi.fn()
    BrowserWindow.getAllWindows = vi.fn(() => [{ isDestroyed: () => false, id: 99, webContents: { send } }])
    BrowserWindow.fromWebContents = vi.fn(() => null)

    // Override app.root path for validateSender — must match trustedEvent.url.
    vi.spyOn(application, 'getPath').mockImplementation((key: string) =>
      key === 'app.root' ? 'C:/mock/app.root' : `/mock/${key}`
    )

    const { CacheService } = await import('../CacheService')
    service = new CacheService()
    await service.onInit()
    send.mockClear()
    ;(service as any).pendingSyncs = []
  })

  afterEach(async () => {
    if (service) await service.onStop()
    vi.restoreAllMocks()
  })

  // ---------------------------------------------------------------------------
  // fix A1 — setShared TTL metadata sync
  // ---------------------------------------------------------------------------

  describe('setShared with an equal value (fix A1)', () => {
    it.each([
      ['adds a TTL', undefined, TTL],
      ['extends the TTL', TTL, TTL * 2],
      ['shortens the TTL', TTL, 1_000],
      ['removes the TTL', TTL, undefined]
    ])('broadcasts the full entry once when the write %s', (_label, firstTtl, secondTtl) => {
      service.setShared(PROGRESS_KEY, { progress: 50 }, firstTtl)
      send.mockClear()

      service.setShared(PROGRESS_KEY, { progress: 50 }, secondTtl)
      ;(service as any).flushSyncBatch()

      expect(send).toHaveBeenCalledTimes(1)
      const [channel, batch] = send.mock.calls[0]
      expect(channel).toBe(IpcChannel.Cache_SyncBatch)
      expect(batch).toHaveLength(2)
      expect(batch[1]).toMatchObject({
        type: 'shared',
        key: PROGRESS_KEY,
        value: { progress: 50 },
        expireAt: secondTtl ? now + secondTtl : undefined
      })
    })

    it('does not fire main value-subscribers on a TTL-only update', () => {
      service.setShared(PROGRESS_KEY, { progress: 50 }, TTL)
      const cb = vi.fn()
      service.subscribeSharedChange(PROGRESS_KEY, cb)

      now = BASE + 10_000
      service.setShared(PROGRESS_KEY, { progress: 50 }, TTL) // heartbeat: same value, renewed TTL
      ;(service as any).flushSyncBatch()

      expect(cb).not.toHaveBeenCalled()
      expect(send).toHaveBeenCalledTimes(1) // batched into one Cache_SyncBatch
      const [channel, batch] = send.mock.calls[0]
      expect(channel).toBe(IpcChannel.Cache_SyncBatch)
      expect(batch).toHaveLength(2)
    })

    it('is a full no-op when value and expireAt are both unchanged', () => {
      service.setShared(PROGRESS_KEY, { progress: 50 }, TTL)
      send.mockClear()

      service.setShared(PROGRESS_KEY, { progress: 50 }, TTL) // same tick → same expireAt

      expect(send).not.toHaveBeenCalled()
    })

    it('treats re-setting an EXPIRED entry with the same value as absent → value (resurrection)', () => {
      service.setShared(PROGRESS_KEY, { progress: 100 }, 1_000)
      const cb = vi.fn()
      service.subscribeSharedChange(PROGRESS_KEY, cb)
      now = BASE + 5_000 // entry expired
      send.mockClear()
      ;(service as any).pendingSyncs = []

      service.setShared(PROGRESS_KEY, { progress: 100 }, 1_000)
      ;(service as any).flushSyncBatch()

      // Full broadcast + subscriber fire with oldValue=undefined — NOT a
      // silent TTL-only sync (would happen if the implementation compared
      // against the raw entry instead of the TTL-aware peek).
      expect(send).toHaveBeenCalledTimes(1)
      const [channel, batch] = send.mock.calls[0]
      expect(channel).toBe(IpcChannel.Cache_SyncBatch)
      expect(batch).toHaveLength(1)
      expect(batch[0]).toEqual({
        type: 'shared',
        key: PROGRESS_KEY,
        value: { progress: 100 },
        expireAt: now + 1_000
      })
      expect(cb).toHaveBeenCalledWith({ progress: 100 }, undefined, PROGRESS_KEY)
    })
  })

  // ---------------------------------------------------------------------------
  // fix A2 — unified Main-origin eviction outlet (5 paths)
  // ---------------------------------------------------------------------------

  describe('expired-entry eviction broadcasts a tombstone (fix A2)', () => {
    const expectSingleTombstoneBatch = (key: string) => {
      expect(send).toHaveBeenCalledTimes(1)
      const [channel, batch] = send.mock.calls[0]
      expect(channel).toBe(IpcChannel.Cache_SyncBatch)
      expect(batch).toEqual([{ type: 'shared', key, value: undefined }])
    }

    beforeEach(() => {
      service.setShared(STATE_KEY, { id: 'job-1', status: 'completed' }, TTL)
      now = BASE + TTL + 1 // entry expired
      send.mockClear()
      ;(service as any).pendingSyncs = []
    })

    it('path 1: getShared on an expired entry', () => {
      expect(service.getShared(STATE_KEY)).toBeUndefined()
      ;(service as any).flushSyncBatch()
      expectSingleTombstoneBatch(STATE_KEY)

      // Entry is physically gone — a second read broadcasts nothing more.
      send.mockClear()
      expect(service.getShared(STATE_KEY)).toBeUndefined()
      expect(send).not.toHaveBeenCalled()
    })

    it('path 2: hasShared on an expired entry', () => {
      expect(service.hasShared(STATE_KEY)).toBe(false)
      ;(service as any).flushSyncBatch()
      expectSingleTombstoneBatch(STATE_KEY)
    })

    it('path 3: the GC sweep', () => {
      expect(intervalCallbacks.length).toBeGreaterThan(0)
      intervalCallbacks.forEach((run) => run())
      ;(service as any).flushSyncBatch()
      expectSingleTombstoneBatch(STATE_KEY)
    })

    it('path 4: getAllShared (renderer init sync)', () => {
      const handler = ipcHandlers.get(IpcChannel.Cache_GetAllShared)!
      const all = handler(trustedEvent) as Record<string, unknown>

      expect(all[STATE_KEY]).toBeUndefined()
      ;(service as any).flushSyncBatch()
      expectSingleTombstoneBatch(STATE_KEY)
    })

    it('path 5: deleteShared hitting an already-expired entry', () => {
      expect(service.deleteShared(STATE_KEY)).toBe(true)
      ;(service as any).flushSyncBatch()
      expectSingleTombstoneBatch(STATE_KEY)
    })

    it('deleteShared on a truly absent key broadcasts nothing', () => {
      service.deleteShared('jobs.state.never-existed')
      expect(send).not.toHaveBeenCalled()
    })

    it('TTL eviction never fires main value-subscribers', () => {
      const cb = vi.fn()
      service.subscribeSharedChange(STATE_KEY, cb)

      expect(service.getShared(STATE_KEY)).toBeUndefined()
      intervalCallbacks.forEach((run) => run())
      ;(service as any).flushSyncBatch()

      expect(cb).not.toHaveBeenCalled()
    })

    it('deleteShared on an expired entry does not fire subscribers; on a live entry it still does', () => {
      const cb = vi.fn()
      service.subscribeSharedChange(STATE_KEY, cb)

      service.deleteShared(STATE_KEY) // expired → tombstone only
      ;(service as any).flushSyncBatch()
      expect(cb).not.toHaveBeenCalled()

      service.setShared(STATE_KEY, { id: 'job-1', status: 'running' })
      cb.mockClear()
      service.deleteShared(STATE_KEY) // live → tombstone + subscriber fire
      ;(service as any).flushSyncBatch()
      expect(cb).toHaveBeenCalledWith(undefined, { id: 'job-1', status: 'running' }, STATE_KEY)
    })

    it('JobManager scenario: terminal job entries are tombstoned to every window by the next GC sweep', () => {
      // (state entry from beforeEach is already expired; add the progress twin)
      service.setShared(PROGRESS_KEY, { progress: 100 }, TTL)
      now = BASE + 2 * TTL + 2
      send.mockClear()
      ;(service as any).pendingSyncs = []

      intervalCallbacks.forEach((run) => run())
      ;(service as any).flushSyncBatch()

      expect(send).toHaveBeenCalledTimes(1)
      const [channel, batch] = send.mock.calls[0]
      expect(channel).toBe(IpcChannel.Cache_SyncBatch)
      expect(batch).toHaveLength(2)
      expect(batch).toContainEqual({ type: 'shared', key: STATE_KEY, value: undefined })
      expect(batch).toContainEqual({ type: 'shared', key: PROGRESS_KEY, value: undefined })
    })
  })

  // ---------------------------------------------------------------------------
  // A2 boundaries — paths that must NOT use the unified eviction outlet
  // ---------------------------------------------------------------------------

  describe('eviction outlet boundaries', () => {
    it('renderer-origin tombstone relay excludes the sender and is not double-broadcast', async () => {
      const { BrowserWindow } = (await import('electron')) as any
      const senderSend = vi.fn()
      const otherSend = vi.fn()
      BrowserWindow.getAllWindows.mockReturnValue([
        { isDestroyed: () => false, id: 1, webContents: { send: senderSend } },
        { isDestroyed: () => false, id: 2, webContents: { send: otherSend } }
      ])
      BrowserWindow.fromWebContents.mockReturnValue({ id: 1 })

      service.setShared(STATE_KEY, { id: 'job-1', status: 'running' })
      const cb = vi.fn()
      service.subscribeSharedChange(STATE_KEY, cb)
      senderSend.mockClear()
      otherSend.mockClear()

      const listener = ipcListeners.get(IpcChannel.Cache_Sync)!
      listener(trustedEvent, { type: 'shared', key: STATE_KEY, value: undefined })

      expect(senderSend).not.toHaveBeenCalled() // sender excluded
      expect(otherSend).toHaveBeenCalledTimes(1) // relayed exactly once — no extra eviction broadcast
      expect(cb).toHaveBeenCalledTimes(1)
      expect(cb).toHaveBeenCalledWith(undefined, { id: 'job-1', status: 'running' }, STATE_KEY)
    })

    it('onStop clears entries without broadcasting', async () => {
      service.setShared(STATE_KEY, { id: 'job-1', status: 'running' }, TTL)
      send.mockClear()

      await service.onStop()

      expect(send).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // Shared-cache sync batching
  // ---------------------------------------------------------------------------

  describe('shared-cache sync batching', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(BASE)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('buffers main-origin changes and flushes as one Cache_SyncBatch', () => {
      service.setShared(STATE_KEY, { id: 'job-1', status: 'running' })
      service.setShared(PROGRESS_KEY, { progress: 50 })
      service.setShared(STATE_KEY, { id: 'job-1', status: 'completed' })

      // Buffered: nothing sent yet
      expect(send).not.toHaveBeenCalled()

      vi.advanceTimersByTime(100)

      expect(send).toHaveBeenCalledTimes(1)
      const [channel, batch] = send.mock.calls[0]
      expect(channel).toBe(IpcChannel.Cache_SyncBatch)
      expect(batch).toHaveLength(3)
      expect(batch[0]).toMatchObject({ type: 'shared', key: STATE_KEY, value: { id: 'job-1', status: 'running' } })
      expect(batch[1]).toMatchObject({ type: 'shared', key: PROGRESS_KEY, value: { progress: 50 } })
      expect(batch[2]).toMatchObject({ type: 'shared', key: STATE_KEY, value: { id: 'job-1', status: 'completed' } })
    })

    it('uses a single flush timer across rapid successive writes', () => {
      service.setShared(STATE_KEY, { id: 'job-1', status: 'running' })
      vi.advanceTimersByTime(10)
      service.setShared(PROGRESS_KEY, { progress: 50 })
      vi.advanceTimersByTime(10)
      service.setShared(STATE_KEY, { id: 'job-1', status: 'completed' })

      // Still buffered — only one flush timer is armed
      expect(send).not.toHaveBeenCalled()

      vi.advanceTimersByTime(40) // crosses the 50ms threshold from the first setTimeout

      expect(send).toHaveBeenCalledTimes(1)
      const [channel, batch] = send.mock.calls[0]
      expect(channel).toBe(IpcChannel.Cache_SyncBatch)
      expect(batch).toHaveLength(3)
    })

    it('renderer-origin relay still sends immediately via Cache_Sync', async () => {
      const { BrowserWindow } = (await import('electron')) as any
      BrowserWindow.fromWebContents.mockReturnValue({ id: 42 })

      const listener = ipcListeners.get(IpcChannel.Cache_Sync)!
      listener(trustedEvent, { type: 'shared', key: STATE_KEY, value: 'from-renderer' })

      expect(send).toHaveBeenCalledTimes(1)
      const [channel, message] = send.mock.calls[0]
      expect(channel).toBe(IpcChannel.Cache_Sync)
      expect(message).toEqual({ type: 'shared', key: STATE_KEY, value: 'from-renderer' })
    })

    it('does not batch renderer-origin relay with pending main-origin messages', async () => {
      const { BrowserWindow } = (await import('electron')) as any
      BrowserWindow.fromWebContents.mockReturnValue({ id: 42 })

      service.setShared(STATE_KEY, { id: 'job-1', status: 'running' })
      // Main-origin message is buffered, not yet sent
      expect(send).not.toHaveBeenCalled()

      // Renderer-origin relay sends immediately via Cache_Sync, bypassing the batch
      const listener = ipcListeners.get(IpcChannel.Cache_Sync)!
      listener(trustedEvent, { type: 'shared', key: PROGRESS_KEY, value: 'from-renderer' })

      expect(send).toHaveBeenCalledTimes(1)
      const [channel, message] = send.mock.calls[0]
      expect(channel).toBe(IpcChannel.Cache_Sync)
      expect(message).toEqual({ type: 'shared', key: PROGRESS_KEY, value: 'from-renderer' })

      // The buffered main-origin message is still pending
      vi.advanceTimersByTime(100)
      expect(send).toHaveBeenCalledTimes(2)
      const [batchChannel, batch] = send.mock.calls[1]
      expect(batchChannel).toBe(IpcChannel.Cache_SyncBatch)
      expect(batch).toHaveLength(1)
      expect(batch[0]).toMatchObject({ type: 'shared', key: STATE_KEY, value: { id: 'job-1', status: 'running' } })
    })
  })
})
