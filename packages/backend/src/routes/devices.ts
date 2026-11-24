import { Elysia } from 'elysia'

import { database } from '../db/index'

export const devicesRoutes = (new Elysia({ prefix: '/v1/devices' }) as any).get('', async () => {
  const userId = (this as any).context?.userId

  const rows = database
    .prepare(
      `SELECT id, device_id, platform, name, last_seen_at, revoked_at, created_at, updated_at FROM devices WHERE user_id = ? ORDER BY last_seen_at DESC`
    )
    .all(userId) as any[]

  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      deviceId: r.device_id,
      platform: r.platform,
      name: r.name,
      lastSeenAt: r.last_seen_at,
      revokedAt: r.revoked_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    })),
    error: null,
    meta: { requestId: crypto.randomUUID(), timestamp: Date.now() }
  }
})
