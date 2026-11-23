import { database } from '../db/index'

const DAILY_FREE_CREDITS = 10

export function getBalance(userId: string): { balance: number } {
  const latest = database
    .prepare(`SELECT balance_after FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(userId) as { balance_after: number } | undefined

  return { balance: latest?.balance_after ?? 0 }
}

export function addDailyFreeCredits(userId: string): void {
  const { balance } = getBalance(userId)
  const newBalance = balance + DAILY_FREE_CREDITS
  const id = crypto.randomUUID()
  const now = Date.now()

  database
    .prepare(
      `INSERT INTO credit_ledger (id, user_id, type, amount, balance_after, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, userId, 'daily_free', DAILY_FREE_CREDITS, newBalance, null, now)
}

export function deductCredits(userId: string, amount: number, referenceId: string | null): void {
  const { balance } = getBalance(userId)
  const newBalance = balance - amount
  const id = crypto.randomUUID()
  const now = Date.now()

  database
    .prepare(
      `INSERT INTO credit_ledger (id, user_id, type, amount, balance_after, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, userId, 'usage', -amount, newBalance, referenceId, now)
}

export function getTransactions(
  userId: string,
  limit: number,
  cursor: string | null
): { transactions: any[]; nextCursor: string | null } {
  const rows = database
    .prepare(`SELECT * FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(userId, limit + 1) as any[]

  const nextCursor = rows.length > limit ? rows[limit].id : null
  const transactions = rows.slice(0, limit).map((r) => ({
    id: r.id,
    type: r.type,
    amount: r.amount,
    balanceAfter: r.balance_after,
    referenceId: r.reference_id,
    createdAt: r.created_at
  }))

  return { transactions, nextCursor }
}
