export type MessageRole = 'user' | 'assistant' | 'tool'

export interface Message {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  modelId: string | null
  providerId: string | null
  tokenCount: number | null
  createdAt: number
}
