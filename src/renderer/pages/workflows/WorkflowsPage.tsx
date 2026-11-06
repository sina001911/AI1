import { Plus, Workflow } from 'lucide-react'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@cherrystudio/ui'
import { loggerService } from '@logger'
import { Navbar } from '@renderer/components/Navbar'
import Scrollbar from '@renderer/components/Scrollbar'

const logger = loggerService.withContext('WorkflowsPage')

export const WorkflowsPage: FC = () => {
  const { t } = useTranslation()

  return (
    <div className="flex h-full flex-col">
      <Navbar title={t('title.workflows')} />
      <Scrollbar className="flex-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl border border-border-subtle bg-accent/40">
                <Workflow className="size-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">{t('title.workflows')}</h1>
                <p className="text-sm text-muted-foreground">
                  Reusable multi-step pipelines that chain AI1 agents into repeatable end-to-end processes.
                </p>
              </div>
            </div>
            <Button className="gap-2">
              <Plus className="size-4" />
              New workflow
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {['Software development', 'Film production', 'Research & content', 'Marketing launch'].map(
              (name) => (
                <button
                  key={name}
                  type="button"
                  className="group flex flex-col gap-3 rounded-xl border border-border-subtle bg-card p-4 text-left transition-colors hover:bg-accent/40"
                  onClick={() => logger.info('Workflow template selected', { name })}
                >
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-primary" />
                    <span className="text-sm font-medium text-foreground">{name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A ready-made team template that decomposes the objective into specialist tasks and runs them through the Collaborative Studio.
                  </p>
                </button>
              )
            )}
          </div>

          <div className="rounded-xl border border-dashed border-border-subtle p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No saved workflows yet. Create one from a template or build a custom pipeline in the Collaborative Studio.
            </p>
          </div>
        </div>
      </Scrollbar>
    </div>
  )
}

export default WorkflowsPage