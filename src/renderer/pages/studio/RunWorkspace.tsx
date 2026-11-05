import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Textarea } from '@cherrystudio/ui'
import { useIpcOn } from '@renderer/ipc'
import { useTeamApi } from '@renderer/pages/studio/useTeamApi'

interface RunWorkspaceProps {
  teamId: string
  onRunCreated: (runId: string) => void
}

export function RunWorkspace({ teamId, onRunCreated }: RunWorkspaceProps) {
  const { t } = useTranslation()
  const { startRun, pauseRun, resumeRun, cancelRun } = useTeamApi()

  const [objective, setObjective] = useState('')
  const [runId, setRunId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [cancelled, setCancelled] = useState(false)

  const runIdRef = useRef(runId)
  runIdRef.current = runId

  const handleStart = async () => {
    const trimmed = objective.trim()
    if (!trimmed) return
    setRunning(true)
    try {
      const res = await startRun(teamId, trimmed)
      if (res) {
        setRunId(res.id)
        onRunCreated(res.id)
      }
    } catch {
      setRunning(false)
    }
  }

  const handlePause = async () => {
    if (!runId) return
    await pauseRun(runId)
    setPaused(true)
  }

  const handleResume = async () => {
    if (!runId) return
    await resumeRun(runId)
    setPaused(false)
  }

  const handleCancel = async () => {
    if (!runId) return
    await cancelRun(runId)
    setCancelled(true)
    setRunning(false)
    setRunId(null)
  }

  // Reset the workspace when the run ends through any path (including
  // cancellation from another window or a host-side failure), so the input
  // is never left disabled behind a dead run.
  const reset = () => {
    setRunId(null)
    setRunning(false)
    setPaused(false)
    setCancelled(false)
  }
  useIpcOn('agent.team.run_completed', (payload: { runId: string }) => {
    if (payload.runId !== runIdRef.current) return
    reset()
  })
  useIpcOn('agent.team.run_failed', (payload: { runId: string }) => {
    if (payload.runId !== runIdRef.current) return
    reset()
  })
  useIpcOn('agent.team.run_cancelled', (payload: { runId: string }) => {
    if (payload.runId !== runIdRef.current) return
    reset()
  })

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-1.5 p-4">
        <h3 className="font-semibold leading-none tracking-tight">{t('studio.run_workspace')}</h3>
      </div>
      <div className="grid gap-3 p-4 pt-0">
        <div className="grid gap-1.5">
          <Textarea.Input
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder={t('studio.objective_placeholder')}
            rows={3}
            disabled={running && !paused}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {!runId || cancelled ? (
            <Button onClick={handleStart} disabled={!objective.trim() || running}>
              {t('studio.start_run')}
            </Button>
          ) : null}
          {runId && running && !paused ? (
            <Button variant="outline" onClick={handlePause} disabled={cancelled}>
              {t('studio.pause')}
            </Button>
          ) : null}
          {runId && paused ? (
            <Button variant="outline" onClick={handleResume} disabled={cancelled}>
              {t('studio.resume')}
            </Button>
          ) : null}
          {runId && !cancelled ? (
            <Button variant="destructive" onClick={handleCancel}>
              {t('studio.cancel')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
