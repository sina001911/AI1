import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@cherrystudio/ui'
import { useIpcOn } from '@renderer/ipc'
import { ApprovalQueue } from '@renderer/pages/studio/ApprovalQueue'
import { InterAgentFeed } from '@renderer/pages/studio/InterAgentFeed'
import { MemberFormDialog } from '@renderer/pages/studio/MemberFormDialog'
import { RunWorkspace } from '@renderer/pages/studio/RunWorkspace'
import { SharedContextWindow } from '@renderer/pages/studio/SharedContextWindow'
import { TaskStatusBadge } from '@renderer/pages/studio/TaskStatusBadge'
import { TeamFormDialog } from '@renderer/pages/studio/TeamFormDialog'
import { useTeamApi } from '@renderer/pages/studio/useTeamApi'
import type {
  TeamEntity,
  TeamForm,
  TeamMemberEntity,
  TeamMemberForm,
  TeamMemberPatch,
  TeamRunEntity
} from '@shared/ipc/schemas/ai'

function TeamCard({
  team,
  onEdit,
  onDelete,
  onOpen
}: {
  team: TeamEntity
  onEdit: (team: TeamEntity) => void
  onDelete: (team: TeamEntity) => void
  onOpen: (team: TeamEntity) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-1.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate font-semibold leading-none tracking-tight text-base">{team.name}</h3>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => onOpen(team)}>
              {t('studio.open')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onEdit(team)}>
              {t('studio.edit')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(team)}>
              {t('studio.delete')}
            </Button>
          </div>
        </div>
      </div>
      <div className="grid gap-1 p-4 pt-0 text-sm text-muted-foreground">
        {team.description ? <p className="truncate">{team.description}</p> : null}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span>
            {t('studio.strategy')}: {team.strategy}
          </span>
          <span>
            {t('studio.max_concurrency')}: {team.maxConcurrency}
          </span>
          <span>
            {t('studio.leader')}: {team.leaderConfig.name}
          </span>
        </div>
      </div>
    </div>
  )
}

function MemberList({
  members,
  onEdit,
  onDelete
}: {
  members: TeamMemberEntity[]
  onEdit: (m: TeamMemberEntity) => void
  onDelete: (m: TeamMemberEntity) => void
}) {
  const { t } = useTranslation()
  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('studio.no_specialists')}</p>
  }
  return (
    <div className="grid gap-2">
      {members.map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
          <div className="min-w-0">
            <div className="truncate font-medium">
              {m.name} <span className="text-muted-foreground">({m.role})</span>
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {m.providerId} / {m.modelId}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => onEdit(m)}>
              {t('studio.edit')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(m)}>
              {t('studio.delete')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

function RunHistory({ runs }: { runs: TeamRunEntity[] }) {
  const { t } = useTranslation()
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('studio.no_results')}</p>
  }
  return (
    <div className="grid gap-2">
      {runs.map((r) => (
        <div key={r.id} className="rounded border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">{r.objective}</span>
            <span className="text-xs text-muted-foreground">{r.status}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t('studio.created_at')}: {new Date(r.createdAt).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  )
}

export function StudioPage() {
  const { t } = useTranslation()
  const api = useTeamApi()
  const [teams, setTeams] = useState<TeamEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [teamDialogOpen, setTeamDialogOpen] = useState(false)
  const [teamDialogInitial, setTeamDialogInitial] = useState<TeamEntity | null>(null)
  const [memberDialogOpen, setMemberDialogOpen] = useState(false)
  const [memberDialogInitial, setMemberDialogInitial] = useState<TeamMemberEntity | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<TeamEntity | null>(null)
  const [memberDeleteConfirm, setMemberDeleteConfirm] = useState<TeamMemberEntity | null>(null)
  const [members, setMembers] = useState<TeamMemberEntity[]>([])
  const [runs, setRuns] = useState<TeamRunEntity[]>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  interface StudioTaskProgress {
    id: string
    title: string
    status: string
    output: string | null
  }

  const [tasks, setTasks] = useState<StudioTaskProgress[]>([])
  const [synthesis, setSynthesis] = useState('')

  const selectedTeam = useMemo(() => teams.find((team) => team.id === selectedTeamId) ?? null, [teams, selectedTeamId])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.listTeams()
      if (list) {
        setTeams(list)
        setSelectedTeamId((prev) => {
          if (prev && list.some((t) => t.id === prev)) return prev
          return list[0]?.id ?? null
        })
      }
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.listTeams])

  const refreshMembers = useCallback(
    async (teamId: string) => {
      const list = await api.listMembers(teamId)
      if (list) setMembers(list)
    },
    [api.listMembers]
  )

  const refreshRuns = useCallback(
    async (teamId: string) => {
      const list = await api.listRuns(teamId)
      if (list) setRuns(list)
    },
    [api.listRuns]
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!selectedTeamId) return
    void refreshMembers(selectedTeamId)
    void refreshRuns(selectedTeamId)
  }, [selectedTeamId, refreshMembers, refreshRuns])

  useEffect(() => {
    if (!activeRunId) return
    const timer = setInterval(() => {
      void (async () => {
        const state = await api.getRunState(activeRunId)
        if (state) {
          setTasks(state.tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, output: t.output })))
          if (state.run.status === 'completed' || state.run.status === 'failed' || state.run.status === 'cancelled') {
            setActiveRunId(null)
          }
        }
      })()
    }, 1500)
    return () => clearInterval(timer)
  }, [activeRunId, api.getRunState])

  const handleCreateTeam = useCallback(
    async (form: TeamForm) => {
      const created = await api.createTeam(form)
      if (created) {
        setTeams((prev) => [created, ...prev])
        setSelectedTeamId(created.id)
      }
    },
    [api.createTeam]
  )

  const handleUpdateTeam = useCallback(
    async (team: TeamEntity, form: TeamForm) => {
      const updated = await api.updateTeam(team.id, {
        name: form.name,
        description: form.description,
        strategy: form.strategy,
        maxConcurrency: form.maxConcurrency,
        leaderConfig: form.leaderConfig
      })
      if (updated) setTeams((prev) => prev.map((t) => (t.id === team.id ? updated : t)))
    },
    [api.updateTeam]
  )

  const handleDeleteTeam = useCallback(
    async (team: TeamEntity) => {
      await api.deleteTeam(team.id)
      setTeams((prev) => prev.filter((t) => t.id !== team.id))
      if (selectedTeamId === team.id) setSelectedTeamId(null)
    },
    [api.deleteTeam, selectedTeamId]
  )

  const handleCreateMember = useCallback(
    async (member: TeamMemberForm) => {
      if (!selectedTeamId) return
      const created = await api.createMember(selectedTeamId, member)
      if (created) setMembers((prev) => [...prev, created])
    },
    [api.createMember, selectedTeamId]
  )

  const handleUpdateMember = useCallback(
    async (member: TeamMemberEntity, patch: TeamMemberPatch) => {
      const updated = await api.updateMember(member.id, patch)
      if (updated) setMembers((prev) => prev.map((m) => (m.id === member.id ? updated : m)))
    },
    [api.updateMember]
  )

  const handleDeleteMember = useCallback(
    async (member: TeamMemberEntity) => {
      await api.deleteMember(member.id)
      setMembers((prev) => prev.filter((m) => m.id !== member.id))
    },
    [api.deleteMember]
  )

  // Real-time events for the active run.
  useIpcOn('agent.team.task.started', (payload) => {
    if (payload.runId !== activeRunId) return
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === payload.taskId ? { ...t, status: 'running' } : t))
      return next.length ? next : prev
    })
  })
  useIpcOn('agent.team.task.completed', (payload) => {
    if (payload.runId !== activeRunId) return
    setTasks((prev) =>
      prev.map((t) => (t.id === payload.taskId ? { ...t, status: 'completed', output: payload.output } : t))
    )
  })
  useIpcOn('agent.team.task.failed', (payload) => {
    if (payload.runId !== activeRunId) return
    setTasks((prev) => prev.map((t) => (t.id === payload.taskId ? { ...t, status: 'failed' } : t)))
  })
  useIpcOn('agent.team.synthesis_completed', (payload) => {
    if (payload.runId !== activeRunId) return
    setSynthesis(payload.result)
  })
  useIpcOn('agent.team.run_completed', (payload) => {
    if (payload.runId !== activeRunId) return
    setSynthesis(payload.result)
    setActiveRunId(null)
  })
  useIpcOn('agent.team.run_failed', (payload) => {
    if (payload.runId !== activeRunId) return
    setActiveRunId(null)
  })
  useIpcOn('agent.team.run_cancelled', (payload) => {
    if (payload.runId !== activeRunId) return
    setActiveRunId(null)
  })

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">{t('studio.loading')}</p>
  }

  return (
    <div className="grid gap-6 p-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t('studio.title.studio')}</h1>
        <Button
          onClick={() => {
            setTeamDialogInitial(null)
            setTeamDialogOpen(true)
          }}>
          {t('studio.add_team')}
        </Button>
      </div>

      {teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('studio.empty_state')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="grid gap-3 xl:col-span-1">
            <h2 className="text-sm font-medium">{t('studio.nav_teams')}</h2>
            {teams.map((team) => (
              <div key={team.id} onClick={() => setSelectedTeamId(team.id)} className="cursor-pointer">
                <TeamCard
                  team={team}
                  onOpen={(t) => setSelectedTeamId(t.id)}
                  onEdit={(t) => {
                    setTeamDialogInitial(t)
                    setTeamDialogOpen(true)
                  }}
                  onDelete={setDeleteConfirm}
                />
              </div>
            ))}
          </div>

          <div className="grid gap-4 xl:col-span-2">
            {selectedTeam ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-medium">{selectedTeam.name}</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTeamDialogInitial(selectedTeam)
                      setTeamDialogOpen(true)
                    }}>
                    {t('studio.edit')}
                  </Button>
                </div>

                <Tabs defaultValue="overview">
                  <TabsList>
                    <TabsTrigger value="overview">{t('studio.tab_overview')}</TabsTrigger>
                    <TabsTrigger value="runs">{t('studio.tab_runs')}</TabsTrigger>
                    <TabsTrigger value="history">{t('studio.tab_history')}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="grid gap-4 mt-3">
                    <div className="grid gap-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-medium">{t('studio.specialists')}</h3>
                        <Button size="sm" onClick={() => setMemberDialogOpen(true)}>
                          {t('studio.add_specialist')}
                        </Button>
                      </div>
                      <MemberList
                        members={members}
                        onEdit={(m) => {
                          setMemberDialogInitial(m)
                          setMemberDialogOpen(true)
                        }}
                        onDelete={setMemberDeleteConfirm}
                      />
                    </div>
                    <RunWorkspace teamId={selectedTeam.id} onRunCreated={(id) => setActiveRunId(id)} />
                  </TabsContent>

                  <TabsContent value="runs" className="mt-3">
                    {activeRunId ? (
                      <div className="grid gap-3">
                        <div className="flex items-center gap-2">
                          <TaskStatusBadge status="running" />
                          <span className="text-sm font-medium">{t('studio.run_started')}</span>
                        </div>
                        <ApprovalQueue runId={activeRunId} />
                        <div className="grid gap-3 lg:grid-cols-2">
                          <SharedContextWindow runId={activeRunId} />
                          <InterAgentFeed runId={activeRunId} />
                        </div>
                        {tasks.length > 0 ? (
                          <div className="grid gap-2">
                            {tasks.map((task) => (
                              <div key={task.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                                <TaskStatusBadge status={task.status} />
                                <span className="truncate font-medium">{task.title}</span>
                                {task.output ? (
                                  <span className="truncate text-muted-foreground">{task.output}</span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {synthesis ? (
                          <div className="rounded border p-3 text-sm">
                            <span className="font-medium">{t('studio.result')}:</span> {synthesis}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t('studio.no_results')}</p>
                    )}
                  </TabsContent>

                  <TabsContent value="history" className="mt-3">
                    <RunHistory runs={runs} />
                  </TabsContent>
                </Tabs>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t('studio.empty_state')}</p>
            )}
          </div>
        </div>
      )}

      <TeamFormDialog
        open={teamDialogOpen}
        onOpenChange={setTeamDialogOpen}
        initial={teamDialogInitial}
        onSubmit={teamDialogInitial ? (form) => handleUpdateTeam(teamDialogInitial, form) : handleCreateTeam}
      />

      <MemberFormDialog
        open={memberDialogOpen}
        onOpenChange={setMemberDialogOpen}
        initial={memberDialogInitial}
        onSubmit={memberDialogInitial ? (form) => handleUpdateMember(memberDialogInitial, form) : handleCreateMember}
      />

      <Dialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm(null)
        }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('studio.delete_team_confirm_title')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('studio.delete_team_confirm')} {deleteConfirm?.name}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              {t('studio.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirm) {
                  void handleDeleteTeam(deleteConfirm)
                  setDeleteConfirm(null)
                }
              }}>
              {t('studio.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={memberDeleteConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setMemberDeleteConfirm(null)
        }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('studio.delete_member_confirm_title')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('studio.delete_member_confirm')} {memberDeleteConfirm?.name}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberDeleteConfirm(null)}>
              {t('studio.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (memberDeleteConfirm) {
                  void handleDeleteMember(memberDeleteConfirm)
                  setMemberDeleteConfirm(null)
                }
              }}>
              {t('studio.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
