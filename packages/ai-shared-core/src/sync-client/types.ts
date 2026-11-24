export type SyncOperationType = 'create' | 'update' | 'delete'

export interface SyncDelta<T = unknown> {
  id: string
  type: SyncOperationType
  entityType: string
  entityId: string
  payload: T | null
  timestamp: number
  deviceId: string | null
}

export interface SyncCheckpoint {
  userId: string
  deviceId: string
  entityType: string
  lastEntityId: string | null
  lastTimestamp: number
  updatedAt: number
}

export interface SyncRequest {
  deviceId: string
  checkpoints: Record<string, SyncCheckpoint>
}

export interface SyncResponse {
  deltas: SyncDelta[]
  newCheckpoints: Record<string, SyncCheckpoint>
  serverTimestamp: number
}
