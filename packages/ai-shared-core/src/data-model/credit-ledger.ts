export type CreditTransactionType = 'purchase' | 'daily_free' | 'usage' | 'refund' | 'adjustment'

export interface CreditLedgerEntry {
  id: string
  userId: string
  type: CreditTransactionType
  amount: number
  balanceAfter: number
  referenceId: string | null
  createdAt: number
}

export interface CreditBalance {
  userId: string
  balance: number
  updatedAt: number
}
