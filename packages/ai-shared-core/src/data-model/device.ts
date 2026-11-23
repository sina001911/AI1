export type DevicePlatform = 'desktop' | 'android' | 'ios' | 'web'

export interface Device {
  id: string
  userId: string
  deviceId: string
  platform: DevicePlatform
  name: string | null
  lastSeenAt: number | null
  revokedAt: number | null
  createdAt: number
  updatedAt: number
}
