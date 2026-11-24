import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

const uuid = () => crypto.randomUUID()
const now = (() => Date.now()) as unknown as () => Date

export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(uuid),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(now),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(now)
})

export const devices = sqliteTable('devices', {
  id: text('id').primaryKey().$defaultFn(uuid),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  deviceId: text('device_id').notNull().unique(),
  platform: text('platform', {
    enum: ['desktop', 'android', 'ios', 'web']
  }).notNull(),
  name: text('name'),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(now),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(now)
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey().$defaultFn(uuid),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  deviceId: text('device_id')
    .notNull()
    .references(() => devices.deviceId),
  accessTokenJti: text('access_token_jti').notNull().unique(),
  refreshTokenHash: text('refresh_token_hash').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(now)
})

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey().$defaultFn(uuid),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  title: text('title'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(now),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(now),
  deletedAt: integer('deleted_at', { mode: 'timestamp' })
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey().$defaultFn(uuid),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id),
  role: text('role', { enum: ['user', 'assistant', 'tool'] }).notNull(),
  content: text('content').notNull(),
  modelId: text('model_id'),
  providerId: text('provider_id'),
  tokenCount: integer('token_count'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(now)
})

export const creditLedger = sqliteTable('credit_ledger', {
  id: text('id').primaryKey().$defaultFn(uuid),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  type: text('type', {
    enum: ['purchase', 'daily_free', 'usage', 'refund', 'adjustment']
  }).notNull(),
  amount: real('amount').notNull(),
  balanceAfter: real('balance_after').notNull(),
  referenceId: text('reference_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(now)
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Device = typeof devices.$inferSelect
export type NewDevice = typeof devices.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type Conversation = typeof conversations.$inferSelect
export type NewConversation = typeof conversations.$inferInsert
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
export type CreditLedgerEntry = typeof creditLedger.$inferSelect
export type NewCreditLedgerEntry = typeof creditLedger.$inferInsert
