import { ImagePlus, Video } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Separator } from '@cherrystudio/ui'
import { Navbar } from '@renderer/components/Navbar'
import Scrollbar from '@renderer/components/Scrollbar'
import { useModels } from '@renderer/hooks/useModel'
import { useProviders } from '@renderer/hooks/useProvider'
import { VideoGenerationPanel } from '@renderer/pages/creativeLab/VideoGenerationPanel'
import { openRoute } from '@renderer/services/mainWindowNavigation'
import { isGenerateVideoModel } from '@shared/utils/model'

export const MediaToolsPage = () => {
  const { t } = useTranslation()
  const { models, isLoading: modelsLoading } = useModels()
  const { providers, isLoading: providersLoading } = useProviders()

  const videoModels = useMemo(() => models.filter((model) => isGenerateVideoModel(model)), [models])
  const hasConfiguredVideoProvider = useMemo(
    () =>
      videoModels.some((model) => providers.some((provider) => provider.id === model.providerId && provider.isEnabled)),
    [videoModels, providers]
  )

  return (
    <div className="flex h-full flex-col">
      <Navbar title={t('title.media_tools')} />
      <Scrollbar className="flex-1">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6">
          {/* Video Generation */}
          <section className="flex flex-col gap-4 rounded-xl border border-border-subtle bg-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl border border-border-subtle bg-accent/40">
                <Video className="size-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">{t('media_tools.video_generation.title')}</h2>
                <p className="text-sm text-muted-foreground">{t('media_tools.video_generation.desc')}</p>
              </div>
            </div>
            <VideoGenerationPanel
              models={videoModels}
              providers={providers}
              isLoading={modelsLoading || providersLoading}
              hasConfiguredProvider={hasConfiguredVideoProvider}
              onConfigureProvider={() => openRoute('/app/settings/provider')}
            />
          </section>

          <Separator />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Image Generation */}
            <section className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-card p-6">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl border border-border-subtle bg-accent/40">
                  <ImagePlus className="size-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">{t('media_tools.image_generation.title')}</h2>
                  <p className="text-sm text-muted-foreground">{t('media_tools.image_generation.desc')}</p>
                </div>
              </div>
              <Button className="w-full gap-2" onClick={() => openRoute('/app/paintings')}>
                <ImagePlus className="size-4" />
                {t('media_tools.image_generation.open_studio')}
              </Button>
            </section>

            {/* Media Files */}
            <section className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-card p-6">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl border border-border-subtle bg-accent/40">
                  <ImagePlus className="size-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">{t('media_tools.file_preview.title')}</h2>
                  <p className="text-sm text-muted-foreground">{t('media_tools.file_preview.desc')}</p>
                </div>
              </div>
              <Button className="w-full gap-2" onClick={() => openRoute('/app/files')}>
                <ImagePlus className="size-4" />
                {t('media_tools.file_preview.open_files')}
              </Button>
            </section>
          </div>
        </div>
      </Scrollbar>
    </div>
  )
}
