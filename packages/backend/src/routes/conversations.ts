import { Elysia } from 'elysia'

import { database } from '../db/index'

export const conversationsRoutes = (new Elysia({ prefix: '/v1/conversations' }) as any)
  .get('', async ({ query }: any) => {
    const userId = (this as any).context?.userId
    const limit = Math.min(Number(query.limit) || 20, 100)
    const cursor = (query.cursor as string) ?? null

    const rows = database
      .prepare(
        `SELECT id, title, created_at, updated_at, deleted_at FROM conversations WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?`
      )
      .all(userId, limit + 1) as any[]

    const nextCursor = rows.length > limit ? rows[limit].id : null
    return {
      ok: true,
      data: {
        conversations: rows.slice(0, limit).map((r) => ({
          id: r.id,
          title: r.title,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          deletedAt: r.deleted_at
        })),
        nextCursor
      },
      error: null,
      meta: { requestId: crypto.randomUUID(), timestamp: Date.now() }
    }
  })
  .get('/:id', async ({ params }: any) => {
    const { id } = params as { id: string }
    const userId = (this as any).context?.userId

    const conv = database.prepare(`SELECT * FROM conversations WHERE id = ? AND user_id = ?`).get(id, userId) as any

    if (!conv) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const messages = database
      .prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`)
      .all(id) as any[]

    return {
      ok: true,
      data: {
        id: conv.id,
        title: conv.title,
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
        deletedAt: conv.deleted_at,
        messages: messages.map((m) => ({
          id: m.id,
          conversationId: m.conversation_id,
          role: m.role,
          content: m.content,
          modelId: m.model_id,
          providerId: m.provider_id,
          tokenCount: m.token_count,
          createdAt: m.created_at
        }))
      },
      error: null,
      meta: { requestId: crypto.randomUUID(), timestamp: Date.now() }
    }
  })
  .post('', async ({ body }: any) => {
    const userId = (this as any).context?.userId
    const { title } = body as { title?: string }
    const id = crypto.randomUUID()
    const now = Date.now()

    database
      .prepare(`INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
      .run(id, userId, title ?? null, now, now)

    return {
      ok: true,
      data: { id, title, createdAt: now, updatedAt: now, deletedAt: null },
      error: null,
      meta: { requestId: crypto.randomUUID(), timestamp: Date.now() }
    }
  })
