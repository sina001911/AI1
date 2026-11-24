import * as z from 'zod'

/** Standard API response envelope. Every endpoint returns this shape. */
export const ApiEnvelope = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    ok: z.boolean(),
    data: z.nullable(dataSchema),
    error: z.nullable(
      z.object({
        code: z.string(),
        message: z.string(),
        details: z.record(z.string(), z.unknown()).optional()
      })
    ),
    meta: z.object({
      requestId: z.string(),
      timestamp: z.number()
    })
  })

export type ApiEnvelopeData<T> =
  T extends z.ZodType<any, any, infer U>
    ? { ok: true; data: U; error: null; meta: { requestId: string; timestamp: number } }
    : never

export type ApiError = {
  ok: false
  data: null
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
  meta: { requestId: string; timestamp: number }
}
