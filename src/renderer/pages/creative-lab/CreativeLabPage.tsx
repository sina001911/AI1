import { ImagePlus, Video, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@cherrystudio/ui'
import { loggerService } from '@logger'
import { Navbar } from '@renderer/components/Navbar'
import Scrollbar from '@renderer/components/Scrollbar'
import { openSettingsTab } from '@renderer/services/mainWindowNavigation'
import { useModels } from '@renderer/hooks/useModel'
import { useProviders } from '@renderer/hooks/useProvider'
import { isVideoGenerationModel } from '@shared/utils/model'

import { VideoGenerationPanel } from './VideoGenerationPanel'

const logger = loggerService.withContext('CreativeLabPage')

type CreativeTab = 'image' | 'video'

export const CreativeLabPage = () => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<CreativeTab>('image')
  const { models, isLoading: modelsLoading } = useModels()
  const { providers, isLoading: providersLoading } = useProviders()

  const videoModels = models.filter((model) => isVideoGenerationModel(model))
  const hasVideoModels = videoModels.length > 0
  const hasConfiguredVideoProvider = videoModels.some(
    (model) => providers.some((provider) => provider.id === model.providerId && provider.isEnabled)
  )

  return (
    <div className="flex h-full flex-col">
      <Navbar title={t('title.creative_lab')} />
      <Scrollbar className="flex-1">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6">
          <div className="flex items-center gap-2 rounded-xl border border-border-subtle bg-card p-1">
            <Button
              variant={activeTab === 'image' ? 'secondary' : 'ghost'}
              className="flex-1 gap-2"
              onClick={() => setActiveTab('image')}
            >
              <ImagePlus className="size-4" />
              {t('creative_lab.tab_image')}
            </Button>
            <Button
              variant={activeTab === 'video' ? 'secondary' : 'ghost'}
              className="flex-1 gap-2"
              onClick={() => setActiveTab('video')}
            >
              <Video className="size-4" />
              {t('creative_lab.tab_video')}
            </Button>
          </div>

          {activeTab === 'image' ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl border border-border-subtle bg-accent/40">
                  <Wand2 className="size-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">{t('creative_lab.image_title')}</h2>
                  <p className="text-sm text-muted-foreground">{t('creative_lab.image_desc')}</p>
                </div>
              </div>
              <div className="rounded-xl border border-border-subtle bg-card p-6">
                <p className="text-sm text-muted-foreground">{t('creative_lab.image_hint')}</p>
                <Button
                  className="mt-4 gap-2"
                  onClick={() => {
                    void (async () => {
                      const { ipcApi } = await import('@renderer/ipc')
                      await ipcApi.request('app.navigate', ['/app/paintings'])
                    })().catch((error) => logger.error('Navigate to paintings failed', error))
                  }}
                >
                  {t('creative_lab.open_image_studio')}
                </Button>
              </div>
            </div>
          ) : (
            <VideoGenerationPanel
              models={videoModels}
              providers={providers}
              isLoading={modelsLoading || providersLoading}
              hasConfiguredProvider={hasConfiguredVideoProvider}
              onConfigureProvider={() => openSettingsTab('/settings/provider')}
            />
          )}
        </div>
      </Scrollbar>
    </div>
  )
}

export default CreativeLabPage