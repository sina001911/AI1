import { ImagePlus, Video, Wand2 } from 'lucide-react'
import type { FC } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@cherrystudio/ui'
import { loggerService } from '@logger'
import { Navbar } from '@renderer/components/Navbar'
import Scrollbar from '@renderer/components/Scrollbar'

const logger = loggerService.withContext('CreativeLabPage')

type CreativeTab = 'image' | 'video'

export const CreativeLabPage: FC = () => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = FC.useState<CreativeTab>('image')

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
              Image generation
            </Button>
            <Button
              variant={activeTab === 'video' ? 'secondary' : 'ghost'}
              className="flex-1 gap-2"
              onClick={() => setActiveTab('video')}
            >
              <Video className="size-4" />
              Video generation
            </Button>
          </div>

          {activeTab === 'image' ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl border border-border-subtle bg-accent/40">
                  <Wand2 className="size-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Image generation</h2>
                  <p className="text-sm text-muted-foreground">
                    Describe the scene you want and pick a compatible image model from your configured providers.
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-border-subtle bg-card p-6">
                <p className="text-sm text-muted-foreground">
                  Prompt composer and model picker live in the Paintings workspace. Open it from the sidebar to generate images here.
                </p>
                <Button
                  className="mt-4 gap-2"
                  onClick={() => {
                    void (async () => {
                      const { ipcApi } = await import('@renderer/ipc')
                      await ipcApi.request('app.navigate', ['/app/paintings'])
                    })().catch((error) => logger.error('Navigate to paintings failed', error))
                  }}
                >
                  Open image studio
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl border border-border-subtle bg-accent/40">
                  <Video className="size-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Video generation</h2>
                  <p className="text-sm text-muted-foreground">
                    Turn a prompt or image into a short clip with a compatible video model.
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-border-subtle bg-card p-6">
                <p className="text-sm text-muted-foreground">
                  Video generation requires a configured compatible provider. Once you add one, the prompt composer and job monitor appear here.
                </p>
                <Button
                  variant="outline"
                  className="mt-4 gap-2"
                  onClick={() => logger.info('Video generation provider requested')}
                >
                  Configure video provider
                </Button>
              </div>
            </div>
          )}
        </div>
      </Scrollbar>
    </div>
  )
}

export default CreativeLabPage