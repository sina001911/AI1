import * as z from 'zod'

export const RegisterRequest = z.object({
  email: z.string().min(1),
  password: z.string().min(8)
})

export type RegisterRequest = z.infer<typeof RegisterRequest>

export const LoginRequest = z.object({
  email: z.string().min(1),
  password: z.string().min(1)
})

export type LoginRequest = z.infer<typeof LoginRequest>

export const AuthTokensResponse = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresAt: z.number(),
  refreshTokenExpiresAt: z.number()
})

export type AuthTokensResponse = z.infer<typeof AuthTokensResponse>

export const RefreshRequest = z.object({
  refreshToken: z.string().min(1)
})

export type RefreshRequest = z.infer<typeof RefreshRequest>

export const LogoutRequest = z.object({
  refreshToken: z.string().min(1)
})

export type LogoutRequest = z.infer<typeof LogoutRequest>

export const RegisterDeviceRequest = z.object({
  deviceId: z.string().min(1),
  platform: z.enum(['desktop', 'android', 'ios', 'web']),
  name: z.string().optional(),
  pushToken: z.string().optional()
})

export type RegisterDeviceRequest = z.infer<typeof RegisterDeviceRequest>

export const RevokeDeviceRequest = z.object({
  deviceId: z.string().min(1)
})

export type RevokeDeviceRequest = z.infer<typeof RevokeDeviceRequest>
