import { BookOpen, Compass, Library, Search } from 'lucide-react'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@cherrystudio/ui'
import { loggerService } from '@logger'
import { Navbar } from '@renderer/components/Navbar'
import Scrollbar from '@renderer/components/Scrollbar'

const logger = loggerService.withContext('ExplorePage')

export const ExplorePage: FC = () => {
  const { t } = useTranslation()

  return (
    <div className="flex h-full flex-col">
      <Navbar title={t('title.explore')} />
      <Scrollbar className="flex-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl border border-border-subtle bg-accent/40">
                <Compass className="size-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">{t('title.explore')}</h1>
                <p className="text-sm text-muted-foreground">
                  Browse knowledge bases, templates, and team blueprints assembled by the AI1 community.
                </p>
              </div>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search templates, teams, and knowledge bases" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: Library, title: 'Team blueprints', description: 'Pre-assembled multi-agent teams for common domains.' },
              { icon: BookOpen, title: 'Knowledge packs', description: 'Curated corpora ready to attach to a project workspace.' }
            ].map(({ icon: Icon, title, description }) => (
              <button
                key={title}
                type="button"
                className="group flex flex-col gap-3 rounded-xl border border-border-subtle bg-card p-4 text-left transition-colors hover:bg-accent/40"
                onClick={() => logger.info('Explore item selected', { title })}
              >
                <span className="flex size-9 items-center justify-center rounded-lg border border-border-subtle bg-accent/30">
                  <Icon className="size-4 text-primary" />
                </span>
                <span className="text-sm font-medium text-foreground">{title}</span>
                <span className="text-xs text-muted-foreground">{description}</span>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-dashed border-border-subtle p-8 text-center">
            <p className="text-sm text-muted-foreground">
              The explore catalog is empty. Add a knowledge base or team blueprint from the Collaborative Studio to seed it.
            </p>
          </div>
        </div>
      </Scrollbar>
    </div>
  )
}

export default ExplorePage