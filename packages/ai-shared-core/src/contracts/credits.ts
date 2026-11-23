import * as z from 'zod'

export const CreditBalanceResponse = z.object({
  userId: z.string(),
  balance: z.number(),
  updatedAt: z.number()
})

export type CreditBalanceResponse = z.infer<typeof CreditBalanceResponse>

export const CreditTransactionResponse = z.object({
  id: z.string(),
  type: z.enum(['purchase', 'daily_free', 'usage', 'refund', 'adjustment']),
  amount: z.number(),
  balanceAfter: z.number(),
  referenceId: z.nullable(z.string()),
  createdAt: z.number()
})

export type CreditTransactionResponse = z.infer<typeof CreditTransactionResponse>

export const ListCreditTransactionsQuery = z.object({
  limit: z.number().int().positive().max(100).optional().default(20),
  cursor: z.string().optional()
})

export type ListCreditTransactionsQuery = z.infer<typeof ListCreditTransactionsQuery>
