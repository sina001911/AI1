import * as z from 'zod'

export const GENERATE_VIDEO_TOOL_NAME = 'generate_video'

export const generateVideoOutputItemSchema = z.object({
  id: z.string().describe('File entry id of the generated video.'),
  name: z.string().describe('File name of the generated video.')
})

export const generateVideoOutputSchema = z.array(generateVideoOutputItemSchema)

export type GenerateVideoOutputItem = z.infer<typeof generateVideoOutputItemSchema>
export type GenerateVideoOutput = z.infer<typeof generateVideoOutputSchema>
