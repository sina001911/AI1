import * as z from 'zod'

export const DeviceResponse = z.object({
  id: z.string(),
  deviceId: z.string(),
  platform: z.enum(['desktop', 'android', 'ios', 'web']),
  name: z.nullable(z.string()),
  lastSeenAt: z.nullable(z.number()),
  revokedAt: z.nullable(z.number()),
  createdAt: z.number(),
  updatedAt: z.number()
})

export type DeviceResponse = z.infer<typeof DeviceResponse>

export const ListDevicesResponse = z.array(DeviceResponse)

export type ListDevicesResponse = z.infer<typeof ListDevicesResponse>
