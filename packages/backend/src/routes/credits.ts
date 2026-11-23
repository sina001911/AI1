import { Elysia } from 'elysia'

import { getBalance, addDailyFreeCredits, getTransactions } from '../services/credit.service'

export const creditsRoutes = (new Elysia({ prefix: '/v1/credits' }) as any)
  .get('/balance', async () => {
    const userId = (this as any).context?.userId
    const balance = getBalance(userId)
    return {
      ok: true,
      data: { userId, balance: balance.balance, updatedAt: Date.now() },
      error: null,
      meta: { requestId: crypto.randomUUID(), timestamp: Date.now() }
    }
  })
  .post('/daily-free', async () => {
    const userId = (this as any).context?.userId
    addDailyFreeCredits(userId)
    const balance = getBalance(userId)
    return {
      ok: true,
      data: { userId, balance: balance.balance, updatedAt: Date.now() },
      error: null,
      meta: { requestId: crypto.randomUUID(), timestamp: Date.now() }
    }
  })
  .get('/transactions', async ({ query }: any) => {
    const userId = (this as any).context?.userId
    const limit = Math.min(Number(query.limit) || 20, 100)
    const cursor = (query.cursor as string) ?? null
    const result = getTransactions(userId, limit, cursor)
    return {
      ok: true,
      data: result,
      error: null,
      meta: { requestId: crypto.randomUUID(), timestamp: Date.now() }
    }
  })
