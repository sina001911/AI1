import { Loader2, Video, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Select, SelectItem, Textarea } from '@cherrystudio/ui'
import { loggerService } from '@logger'
import { getProviderDisplayName } from '@renderer/hooks/useProvider'
import type { Model, Provider } from '@shared/data/types/model'

const logger = loggerService.withContext('VideoGenerationPanel')

type GenerationState = 'idle' | 'generating' | 'done' | 'error'

interface VideoGenerationPanelProps {
  readonly models: Model[]
  readonly providers: Provider[]
  readonly isLoading: boolean
  readonly hasConfiguredProvider: boolean
  readonly onConfigureProvider: () => void
}

export function VideoGenerationPanel({
  models,
  providers,
  isLoading,
  hasConfiguredProvider,
  onConfigureProvider
}: VideoGenerationPanelProps) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>(undefined)
  const [state, setState] = useState<GenerationState>('idle')
  const [error, setError] = useState<string | undefined>(undefined)
  const [resultUrl, setResultUrl] = useState<string | undefined>(undefined)
  const [requestId, setRequestId] = useState<string | undefined>(undefined)

  const providerById = new Map(providers.map((provider) => [provider.id, provider]))

  const canGenerate = !!selectedModelId && prompt.trim().length > 0 && state !== 'generating'

  async function startGeneration() {
    if (!selectedModelId || !prompt.trim()) return
    const id = crypto.randomUUID()
    setRequestId(id)
    setState('generating')
    setError(undefined)
    setResultUrl(undefined)
    try {
      const { ipcApi } = await import('@renderer/ipc')
      const result = await ipcApi.request('ai.video.generate', {
        requestId: id,
        payload: {
          uniqueModelId: selectedModelId,
          prompt: prompt.trim(),
          cleanupPolicy: 'delete_when_unreferenced'
        }
      })
      const first = result.files[0]
      if (first) {
        const path = await window.api.file.getPhysicalPath({ id: first.id })
        setResultUrl(path)
      }
      setState('done')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setState('idle')
        return
      }
      setState('error')
      setError(err instanceof Error ? err.message : t('errors.unknown'))
      logger.error('Video generation failed', err)
    }
  }

  async function abortGeneration() {
    if (!requestId) return
    try {
      const { ipcApi } = await import('@renderer/ipc')
      await ipcApi.request('ai.video.abort', { requestId })
    } catch (err) {
      logger.error('Video abort failed', err)
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border-subtle bg-card p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('common.loading')}
        </div>
      </div>
    )
  }

  if (!hasConfiguredProvider) {
    return (
      <div className="rounded-xl border border-border-subtle bg-card p-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border border-border-subtle bg-accent/40">
            <Video className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{t('creative_lab.video_title')}</h2>
            <p className="text-sm text-muted-foreground">{t('creative_lab.video_no_provider_desc')}</p>
          </div>
        </div>
        <Button className="mt-4 gap-2" onClick={onConfigureProvider}>
          {t('creative_lab.configure_provider')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl border border-border-subtle bg-accent/40">
          <Video className="size-5 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('creative_lab.video_title')}</h2>
          <p className="text-sm text-muted-foreground">{t('creative_lab.video_desc')}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border-subtle bg-card p-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">{t('creative_lab.model')}</label>
            <Select
              value={selectedModelId}
              onValueChange={setSelectedModelId}
              placeholder={t('creative_lab.model_placeholder')}
            >
              {models.map((model) => {
                const provider = providerById.get(model.providerId)
                return (
                  <SelectItem
                    key={model.id}
                    value={model.id}
                  >
                    {model.name} ({getProviderDisplayName(provider) ?? model.providerId})
                  </SelectItem>
                )
              })}
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">{t('creative_lab.prompt')}</label>
            <Textarea.Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('creative_lab.prompt_placeholder')}
              rows={4}
            />
          </div>

          {state === 'error' && error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {state === 'done' && resultUrl && (
            <div className="overflow-hidden rounded-lg border border-border-subtle">
              <video src={resultUrl} controls className="max-h-80 w-full" />
            </div>
          )}

          <div className="flex items-center gap-2">
            {state !== 'generating' ? (
              <Button className="gap-2" disabled={!canGenerate} onClick={startGeneration}>
                {t('creative_lab.generate')}
              </Button>
            ) : (
              <Button variant="outline" className="gap-2" onClick={abortGeneration}>
                <X className="size-4" />
                {t('common.cancel')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}