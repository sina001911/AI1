import { useNavigate } from '@tanstack/react-router'
import { Plus, Workflow } from 'lucide-react'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@cherrystudio/ui'
import { loggerService } from '@logger'
import { Navbar } from '@renderer/components/Navbar'
import Scrollbar from '@renderer/components/Scrollbar'
import { useTeamApi } from '@renderer/pages/studio/useTeamApi'

const logger = loggerService.withContext('WorkflowsPage')

interface WorkflowTemplate {
  name: string
  objective: string
  members: { name: string; role: 'coding' | 'research' | 'image' | 'video' | 'data-analyst' | 'reviewer' | 'general' }[]
}

/**
 * Four domain templates. Each one is a ready-made team definition: pick a
 * Leader model, then add the specialist roles the domain needs. Selecting a
 * template navigates to the Collaborative Studio with the team pre-filled
 * and the objective ready to run — the user can still edit anything before
 * starting.
 */
const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    name: 'Software development',
    objective:
      'Build the requested software feature end to end: analyse requirements, write the code, review it, and deliver working files.',
    members: [
      { name: 'Architect', role: 'coding' },
      { name: 'Implementer', role: 'coding' },
      { name: 'Reviewer', role: 'reviewer' }
    ]
  },
  {
    name: 'Film production',
    objective:
      'Produce the short film: research the concept, write the script, generate the storyboard images, and produce the final video.',
    members: [
      { name: 'Screenwriter', role: 'general' },
      { name: 'Storyboard Artist', role: 'image' },
      { name: 'Video Director', role: 'video' }
    ]
  },
  {
    name: 'Research & content',
    objective: 'Research the topic from independent angles, cross-check findings, and write a well-sourced report.',
    members: [
      { name: 'Primary Researcher', role: 'research' },
      { name: 'Secondary Researcher', role: 'research' },
      { name: 'Fact Checker', role: 'reviewer' },
      { name: 'Writer', role: 'general' }
    ]
  },
  {
    name: 'Marketing launch',
    objective:
      'Plan and produce a marketing launch: analyse the market, draft the copy, and assemble the campaign assets.',
    members: [
      { name: 'Market Analyst', role: 'data-analyst' },
      { name: 'Copywriter', role: 'general' },
      { name: 'Creative Director', role: 'image' }
    ]
  }
]

export const WorkflowsPage: FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const api = useTeamApi()

  const handleSelect = async (template: WorkflowTemplate) => {
    logger.info('Workflow template selected', { name: template.name })
    const created = await api.createTeam({
      name: template.name,
      description: template.objective,
      strategy: 'leader-delegation',
      maxConcurrency: 3,
      leaderConfig: {
        name: 'Leader',
        providerId: '',
        modelId: '',
        systemPrompt: ''
      }
    })
    if (!created) return
    for (const member of template.members) {
      await api.createMember(created.id, {
        name: member.name,
        role: member.role,
        providerId: '',
        modelId: '',
        temperature: null,
        maxTokens: null,
        systemPrompt: '',
        toolPermissions: {},
        enabled: true,
        orderKey: '0'
      })
    }
    void api.listMembers(created.id)
    void api.listRuns(created.id)
    navigate({ to: '/app/studio', search: { teamId: created.id, objective: template.objective } })
  }

  const handleNew = () => {
    navigate({ to: '/app/studio' })
  }

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
            <Button className="gap-2" onClick={handleNew}>
              <Plus className="size-4" />
              New workflow
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {WORKFLOW_TEMPLATES.map((template) => (
              <button
                key={template.name}
                type="button"
                className="group flex flex-col gap-3 rounded-xl border border-border-subtle bg-card p-4 text-left transition-colors hover:bg-accent/40"
                onClick={() => void handleSelect(template)}>
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-primary" />
                  <span className="text-sm font-medium text-foreground">{template.name}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  A ready-made team template that decomposes the objective into specialist tasks and runs them through
                  the Collaborative Studio.
                </p>
                <div className="flex flex-wrap gap-1">
                  {template.members.map((m) => (
                    <span
                      key={m.name}
                      className="rounded-md bg-accent/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {m.name}
                    </span>
                  ))}
                </div>
              </button>
            ))}
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
