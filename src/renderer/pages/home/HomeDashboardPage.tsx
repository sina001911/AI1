import { useNavigate } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import {
  ArrowRight,
  BotMessageSquare,
  Clock,
  Layers,
  MessagesSquare,
  Palette,
  Plug,
  Sparkles,
  Users
} from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Skeleton } from '@cherrystudio/ui'
import { formatHistoryTime } from '@renderer/components/history/components/HistoryTableParts'
import { useModels } from '@renderer/hooks/useModel'
import { useProviders } from '@renderer/hooks/useProvider'
import { useTopics } from '@renderer/hooks/useTopic'
import { getProviderDisplayName } from '@renderer/utils/naming'
import { cn } from '@renderer/utils/style'

type AccentToken = 'electric' | 'violet' | 'cyan'

const ACCENT_COLOR: Record<AccentToken, string> = {
  electric: 'var(--a1-electric-500)',
  violet: 'var(--a1-violet-500)',
  cyan: 'var(--a1-cyan-500)'
}

const ACCENT_FOREGROUND: Record<AccentToken, string> = {
  electric: 'var(--a1-electric-300)',
  violet: 'var(--a1-violet-300)',
  cyan: 'var(--a1-cyan-300)'
}

/** A translucent accent fill derived from a brand token, safe in both themes. */
function accentFill(token: AccentToken, percent: number): string {
  return `color-mix(in oklab, ${ACCENT_COLOR[token]} ${percent}%, transparent)`
}

const QUICK_ACTIONS: ReadonlyArray<{
  id: string
  label: string
  description: string
  icon: typeof BotMessageSquare
  route: string
  accent: AccentToken
}> = [
  {
    id: 'chat',
    label: 'home_dashboard.quick.chat',
    description: 'Chat with any model, right away',
    icon: MessagesSquare,
    route: '/app/chat',
    accent: 'electric'
  },
  {
    id: 'studio',
    label: 'home_dashboard.quick.studio',
    description: 'Orchestrate a team of specialists',
    icon: Users,
    route: '/app/studio',
    accent: 'violet'
  },
  {
    id: 'agents',
    label: 'home_dashboard.quick.agents',
    description: 'Autonomous agents with tools',
    icon: BotMessageSquare,
    route: '/app/agents',
    accent: 'cyan'
  },
  {
    id: 'paintings',
    label: 'home_dashboard.quick.paintings',
    description: 'Generate and refine imagery',
    icon: Palette,
    route: '/app/paintings',
    accent: 'violet'
  },
  {
    id: 'creative_lab',
    label: 'home_dashboard.quick.creative_lab',
    description: 'Turn prompts into motion',
    icon: Sparkles,
    route: '/app/creative-lab',
    accent: 'electric'
  }
]

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('a1-glass flex flex-col gap-3 rounded-2xl p-5', 'shadow-[var(--a1-shadow-sm)]', className)}>
      {children}
    </section>
  )
}

function PanelHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</h2>
}

function StatPill({ icon: Icon, label, value }: { icon: typeof Layers; label: string; value: number | string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-[var(--a1-glass-border)] bg-black/10 px-3 py-2 dark:bg-white/5">
      <Icon className="size-4 text-[var(--a1-foreground-muted)]" strokeWidth={1.7} />
      <div className="flex flex-col leading-none">
        <span className="text-sm font-semibold tabular-nums text-[var(--a1-foreground)]">{value}</span>
        <span className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--a1-foreground-muted)]">{label}</span>
      </div>
    </div>
  )
}

function QuickActionCard({ action, onClick }: { action: (typeof QUICK_ACTIONS)[number]; onClick: () => void }) {
  const { t } = useTranslation()
  const Icon = action.icon
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(
        'group/a1 h-auto w-full justify-start gap-3.5 rounded-2xl border border-border/70 bg-card/70 p-4 text-start',
        'transition-[transform,border-color,box-shadow,background-color] duration-200',
        'hover:-translate-y-0.5 hover:border-[var(--a1-border-strong)] hover:bg-card hover:shadow-[var(--a1-shadow-md)]'
      )}>
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-xl border"
        style={{
          backgroundColor: accentFill(action.accent, 16),
          borderColor: accentFill(action.accent, 32),
          color: ACCENT_FOREGROUND[action.accent]
        }}>
        <Icon className="size-5" strokeWidth={1.8} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-foreground">{t(action.label)}</span>
        <span className="truncate text-xs text-muted-foreground">{action.description}</span>
      </span>
      <ArrowRight
        className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover/a1:opacity-100 rtl:rotate-180"
        strokeWidth={1.8}
      />
    </Button>
  )
}

function ModelRow({ name, providerName, accent }: { name: string; providerName: string; accent: AccentToken }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-accent/40">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold"
        style={{ backgroundColor: accentFill(accent, 18), color: ACCENT_FOREGROUND[accent] }}>
        {name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{name}</div>
        <div className="truncate text-xs text-muted-foreground">{providerName}</div>
      </div>
    </div>
  )
}

function ConversationRow({
  t,
  topic,
  onClick
}: {
  t: TFunction
  topic: { id: string; name: string; updatedAt: string }
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className="flex h-auto w-full items-center gap-3 rounded-xl px-2 py-1.5 text-start transition-colors hover:bg-accent/40">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/40 text-muted-foreground">
        <MessagesSquare className="size-4" strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{topic.name}</span>
        <span className="block text-xs text-muted-foreground">{formatHistoryTime(topic.updatedAt, t)}</span>
      </span>
      <Clock className="size-3.5 shrink-0 text-muted-foreground/70" strokeWidth={1.7} />
    </Button>
  )
}

export default function HomeDashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { models, isLoading: modelsLoading } = useModels()
  const { providers, isLoading: providersLoading } = useProviders()
  const { topics: allTopics, isLoading: topicsLoading } = useTopics({ loadAll: true })

  const providerMap = useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers])
  const popularModels = useMemo(() => models.slice(0, 6), [models])
  const recentTopics = useMemo(
    () =>
      (allTopics ?? [])
        .slice()
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 6),
    [allTopics]
  )

  const enabledProviders = providers.filter((p) => p.isEnabled !== false).length
  const accentCycle: AccentToken[] = ['electric', 'violet', 'cyan']

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6 lg:p-8">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-[var(--a1-glass-border)] p-7 text-[var(--a1-foreground)] shadow-[var(--a1-shadow-md)] lg:p-9">
          <div className="absolute inset-0 bg-[var(--a1-gradient-aurora)] opacity-90" aria-hidden />
          <div
            className="absolute inset-0 opacity-70"
            style={{ background: 'radial-gradient(120% 140% at 100% 0%, var(--a1-violet-600), transparent 55%)' }}
            aria-hidden
          />
          <div className="relative flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-white/85 backdrop-blur">
                <Sparkles className="size-3.5" strokeWidth={2} />
                AI1
              </span>
              <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
                {t('home_dashboard.hero.title', { defaultValue: 'Your Unified AI Workspace' })}
              </h1>
              <p className="max-w-xl text-sm text-white/80">
                {t('home_dashboard.hero.subtitle', { defaultValue: 'One Platform. Infinite Possibilities.' })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <StatPill icon={Layers} label={t('home_dashboard.popular_models.title')} value={models.length} />
              <StatPill
                icon={Plug}
                label={t('home_dashboard.system_status.connected_models')}
                value={enabledProviders}
              />
              <StatPill
                icon={MessagesSquare}
                label={t('home_dashboard.recent_conversations.title')}
                value={recentTopics.length}
              />
            </div>
          </div>
        </section>

        {/* Quick actions */}
        <section className="flex flex-col gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t('home_dashboard.quick_actions.title', { defaultValue: 'Workspaces' })}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {QUICK_ACTIONS.map((action) => (
              <QuickActionCard key={action.id} action={action} onClick={() => void navigate({ to: action.route })} />
            ))}
          </div>
        </section>

        {/* Lower grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <Panel className="lg:col-span-7">
            <PanelHeading>
              {t('home_dashboard.recent_conversations.title', { defaultValue: 'Recent Conversations' })}
            </PanelHeading>
            <div className="flex flex-col gap-0.5">
              {topicsLoading ? (
                <>
                  <Skeleton className="h-11 w-full rounded-xl" />
                  <Skeleton className="h-11 w-full rounded-xl" />
                  <Skeleton className="h-11 w-full rounded-xl" />
                </>
              ) : recentTopics.length > 0 ? (
                recentTopics.map((topic) => (
                  <ConversationRow
                    key={topic.id}
                    t={t}
                    topic={topic}
                    onClick={() => void navigate({ to: '/app/chat', search: { topicId: topic.id } })}
                  />
                ))
              ) : (
                <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                  {t('home_dashboard.empty_conversations', { defaultValue: 'No recent conversations.' })}
                </p>
              )}
            </div>
          </Panel>

          <div className="flex flex-col gap-6 lg:col-span-5">
            <Panel>
              <PanelHeading>
                {t('home_dashboard.popular_models.title', { defaultValue: 'Popular Models' })}
              </PanelHeading>
              <div className="flex flex-col gap-0.5">
                {modelsLoading || providersLoading ? (
                  <>
                    <Skeleton className="h-10 w-full rounded-xl" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                  </>
                ) : popularModels.length > 0 ? (
                  popularModels.map((model, index) => {
                    const provider = providerMap.get(model.providerId)
                    return (
                      <ModelRow
                        key={model.id}
                        name={model.name}
                        providerName={provider ? getProviderDisplayName(provider) : model.providerId}
                        accent={accentCycle[index % accentCycle.length]}
                      />
                    )
                  })
                ) : (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    {t('home_dashboard.empty', { defaultValue: 'No models yet.' })}
                  </p>
                )}
              </div>
            </Panel>

            <Panel>
              <PanelHeading>{t('home_dashboard.system_status.title', { defaultValue: 'System Status' })}</PanelHeading>
              <div className="flex flex-col gap-2.5">
                <StatusRow
                  label={t('home_dashboard.system_status.connected_models', { defaultValue: 'Connected Models' })}
                  value={enabledProviders}
                  healthy={enabledProviders > 0}
                />
                <StatusRow
                  label={t('home_dashboard.popular_models.title', { defaultValue: 'Available Models' })}
                  value={models.length}
                  healthy={models.length > 0}
                />
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusRow({ label, value, healthy }: { label: string; value: number; healthy: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/30 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            'size-2 shrink-0 rounded-full',
            healthy ? 'bg-[var(--a1-cyan-400)] shadow-[0_0_8px_var(--a1-cyan-500)]' : 'bg-muted-foreground/40'
          )}
        />
        <span className="truncate text-xs text-muted-foreground">{label}</span>
      </div>
      <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  )
}
