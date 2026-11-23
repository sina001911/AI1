import * as z from 'zod'

export const ConversationResponse = z.object({
  id: z.string(),
  title: z.nullable(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.nullable(z.number())
})

export type ConversationResponse = z.infer<typeof ConversationResponse>

export const MessageResponse = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(['user', 'assistant', 'tool']),
  content: z.string(),
  modelId: z.nullable(z.string()),
  providerId: z.nullable(z.string()),
  tokenCount: z.nullable(z.number()),
  createdAt: z.number()
})

export type MessageResponse = z.infer<typeof MessageResponse>

export const ConversationDetailResponse = ConversationResponse.extend({
  messages: z.array(MessageResponse)
})

export type ConversationDetailResponse = z.infer<typeof ConversationDetailResponse>

export const CreateConversationRequest = z.object({
  title: z.string().optional()
})

export type CreateConversationRequest = z.infer<typeof CreateConversationRequest>

export const SendMessageRequest = z.object({
  conversationId: z.string(),
  content: z.string().min(1),
  modelId: z.string().optional(),
  providerId: z.string().optional()
})

export type SendMessageRequest = z.infer<typeof SendMessageRequest>

export const ListConversationsQuery = z.object({
  limit: z.number().int().positive().max(100).optional().default(20),
  cursor: z.string().optional()
})

export type ListConversationsQuery = z.infer<typeof ListConversationsQuery>
