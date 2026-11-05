import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ipcApi } from '@renderer/ipc'
import { toast } from '@renderer/services/toast'
import type {
  TeamEntity,
  TeamForm,
  TeamMemberEntity,
  TeamMemberForm,
  TeamMemberPatch,
  TeamPatch,
  TeamRunEntity,
  TeamRunEventEntity,
  TeamRunState
} from '@shared/ipc/schemas/ai'

/**
 * Thin typed wrapper over the `agent.team.*` IPC routes. The renderer never
 * touches the DB directly — every command goes through `ipcApi.request`,
 * which is typed against the zod schemas in `@shared/ipc/schemas/ai`.
 *
 * Commands default to NO retry (see `ipcApi`): retrying a side-effecting
 * command (create / delete / start) is dangerous, so failures surface as a
 * toast and the caller re-reads the list on success.
 */
export function useTeamApi() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)

  const run = useCallback(
    async <T>(op: () => Promise<T>): Promise<T | null> => {
      setLoading(true)
      try {
        return await op()
      } catch (error) {
        toast.error({
          title: t('common.error'),
          description: error instanceof Error ? error.message : String(error)
        })
        return null
      } finally {
        setLoading(false)
      }
    },
    [t]
  )

  const listTeams = useCallback(async () => run(() => ipcApi.request('agent.team.list')), [run])
  const createTeam = useCallback(async (form: TeamForm) => run(() => ipcApi.request('agent.team.create', form)), [run])
  const updateTeam = useCallback(
    async (teamId: string, patch: TeamPatch) => run(() => ipcApi.request('agent.team.update', { teamId, patch })),
    [run]
  )
  const deleteTeam = useCallback(
    async (teamId: string) => run(() => ipcApi.request('agent.team.delete', { teamId })),
    [run]
  )

  const listMembers = useCallback(
    async (teamId: string) => run(() => ipcApi.request('agent.team.member.list', { teamId })),
    [run]
  )
  const createMember = useCallback(
    async (teamId: string, member: TeamMemberForm) =>
      run(() => ipcApi.request('agent.team.member.create', { teamId, member })),
    [run]
  )
  const updateMember = useCallback(
    async (memberId: string, patch: TeamMemberPatch) =>
      run(() => ipcApi.request('agent.team.member.update', { memberId, patch })),
    [run]
  )
  const deleteMember = useCallback(
    async (memberId: string) => run(() => ipcApi.request('agent.team.member.delete', { memberId })),
    [run]
  )

  const startRun = useCallback(
    async (teamId: string, objective: string) =>
      run(() => ipcApi.request('agent.team.run.start', { teamId, objective })),
    [run]
  )
  const pauseRun = useCallback(
    async (runId: string) => run(() => ipcApi.request('agent.team.run.pause', { runId })),
    [run]
  )
  const resumeRun = useCallback(
    async (runId: string) => run(() => ipcApi.request('agent.team.run.resume', { runId })),
    [run]
  )
  const cancelRun = useCallback(
    async (runId: string) => run(() => ipcApi.request('agent.team.run.cancel', { runId })),
    [run]
  )
  const getRunState = useCallback(
    async (runId: string) => run(() => ipcApi.request('agent.team.run.state', { runId })),
    [run]
  )
  const listRuns = useCallback(
    async (teamId: string) => run(() => ipcApi.request('agent.team.run.list', { teamId })),
    [run]
  )
  const listRunEvents = useCallback(
    async (runId: string) => run(() => ipcApi.request('agent.team.run.event.list', { runId })),
    [run]
  )
  const approveTask = useCallback(
    async (runId: string, taskId: string, approved: boolean, reason?: string) =>
      run(() => ipcApi.request('agent.team.run.approve_task', { runId, taskId, approved, reason })),
    [run]
  )

  return {
    loading,
    listTeams,
    createTeam,
    updateTeam,
    deleteTeam,
    listMembers,
    createMember,
    updateMember,
    deleteMember,
    startRun,
    pauseRun,
    resumeRun,
    cancelRun,
    getRunState,
    listRuns,
    listRunEvents,
    approveTask
  }
}

/** Re-export the domain types so consumers don't have to reach into the schema module. */
export type {
  TeamEntity,
  TeamForm,
  TeamMemberEntity,
  TeamMemberForm,
  TeamMemberPatch,
  TeamPatch,
  TeamRunEntity,
  TeamRunEventEntity,
  TeamRunState
}
