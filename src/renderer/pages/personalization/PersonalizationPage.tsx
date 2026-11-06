import { Palette, SlidersHorizontal, Type } from 'lucide-react'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@cherrystudio/ui'
import { loggerService } from '@logger'
import { Navbar } from '@renderer/components/Navbar'
import Scrollbar from '@renderer/components/Scrollbar'

const logger = loggerService.withContext('PersonalizationPage')

export const PersonalizationPage: FC = () => {
  const { t } = useTranslation()

  return (
    <div className="flex h-full flex-col">
      <Navbar title={t('title.personalization')} />
      <Scrollbar className="flex-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-border-subtle bg-accent/40">
              <SlidersHorizontal className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">{t('title.personalization')}</h1>
              <p className="text-sm text-muted-foreground">
                Tune how AI1 looks, feels, and behaves — themes, density, language, and default team composition.
              </p>
            </div>
          </div>

          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Palette className="size-4 text-primary" />
              <h2 className="text-sm font-medium text-foreground">Appearance</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {['Light', 'Dark', 'System'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className="group flex flex-col gap-3 rounded-xl border border-border-subtle bg-card p-4 text-left transition-colors hover:bg-accent/40"
                  onClick={() => logger.info('Theme selected', { mode })}
                >
                  <span className="size-8 rounded-lg border border-border-subtle bg-gradient-to-br from-primary/60 to-primary/20" />
                  <span className="text-sm font-medium text-foreground">{mode}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Type className="size-4 text-primary" />
              <h2 className="text-sm font-medium text-foreground">Language</h2>
            </div>
            <div className="rounded-xl border border-border-subtle bg-card p-4">
              <p className="text-sm text-muted-foreground">
                AI1 ships with bilingual Persian + English support. Switch the active locale from the language switcher in the sidebar.
              </p>
              <Button variant="outline" className="mt-3 gap-2" onClick={() => logger.info('Language switcher requested')}>
                Open language settings
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-foreground">Default team</h2>
            <div className="rounded-xl border border-border-subtle bg-card p-4">
              <p className="text-sm text-muted-foreground">
                Choose which specialist roles AI1 prefers when forming a new team from a project objective.
              </p>
              <Button variant="outline" className="mt-3 gap-2" onClick={() => logger.info('Default team editor requested')}>
                Configure default team
              </Button>
            </div>
          </section>
        </div>
      </Scrollbar>
    </div>
  )
}

export default PersonalizationPage