export interface Conversation {
  id: string
  userId: string
  title: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}
