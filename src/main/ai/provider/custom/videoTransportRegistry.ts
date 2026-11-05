import type { VideoGenerationTransport } from './videoGenerationModel'

interface VideoTransportRegistration {
  supports: (modelId: string) => boolean
  load: (providerSettings: unknown) => Promise<VideoGenerationTransport>
  poll?: boolean
  cancel?: boolean
}

function createLazyVideoTransport(
  registration: VideoTransportRegistration,
  providerSettings: unknown
): VideoGenerationTransport {
  let transportPromise: Promise<VideoGenerationTransport> | undefined
  const load = () => (transportPromise ??= registration.load(providerSettings))

  return {
    submit: async (input) => (await load()).submit(input),
    ...(registration.poll && {
      poll: async (...args: Parameters<NonNullable<VideoGenerationTransport['poll']>>) => {
        const transport = await load()
        if (!transport.poll) throw new Error('Video transport does not implement polling')
        return transport.poll(...args)
      }
    }),
    ...(registration.cancel && {
      cancel: async (taskId: string) => {
        await (await load()).cancel?.(taskId)
      }
    })
  }
}

const TRANSPORTS: Record<string, VideoTransportRegistration> = {
  runway: {
    supports: () => true,
    poll: true,
    cancel: true,
    load: async (settings) => {
      const { createRunwayVideoTransport } = await import('./runway/runwayVideoTransport')
      return createRunwayVideoTransport(settings as Parameters<typeof createRunwayVideoTransport>[0])
    }
  },
  kling: {
    supports: () => true,
    poll: true,
    cancel: true,
    load: async (settings) => {
      const { createKlingVideoTransport } = await import('./kling/klingVideoTransport')
      return createKlingVideoTransport(settings as Parameters<typeof createKlingVideoTransport>[0])
    }
  },
  luma: {
    supports: () => true,
    poll: true,
    cancel: true,
    load: async (settings) => {
      const { createLumaVideoTransport } = await import('./luma/lumaVideoTransport')
      return createLumaVideoTransport(settings as Parameters<typeof createLumaVideoTransport>[0])
    }
  },
  vidu: {
    supports: () => true,
    poll: true,
    cancel: true,
    load: async (settings) => {
      const { createViduVideoTransport } = await import('./vidu/viduVideoTransport')
      return createViduVideoTransport(settings as Parameters<typeof createViduVideoTransport>[0])
    }
  },
  minimax: {
    supports: () => true,
    poll: true,
    cancel: true,
    load: async (settings) => {
      const { createMinimaxVideoTransport } = await import('./minimax/minimaxVideoTransport')
      return createMinimaxVideoTransport(settings as Parameters<typeof createMinimaxVideoTransport>[0])
    }
  },
  comfyui: {
    supports: () => true,
    poll: true,
    cancel: true,
    load: async (settings) => {
      const { createComfyuiVideoTransport } = await import('./comfyui/comfyuiVideoTransport')
      return createComfyuiVideoTransport(settings as Parameters<typeof createComfyuiVideoTransport>[0])
    }
  }
}

export function hasVideoTransport(providerId: string, modelId: string): boolean {
  return TRANSPORTS[providerId]?.supports(modelId) ?? false
}

export function resolveVideoTransport(
  aiSdkProviderId: string,
  modelId: string,
  providerSettings: unknown
): VideoGenerationTransport | null {
  const registration = TRANSPORTS[aiSdkProviderId]
  return registration?.supports(modelId) ? createLazyVideoTransport(registration, providerSettings) : null
}
