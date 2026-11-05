import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea
} from '@cherrystudio/ui'
import { useModels } from '@renderer/hooks/useModel'
import { useProviders } from '@renderer/hooks/useProvider'
import type { TeamEntity, TeamForm } from '@shared/ipc/schemas/ai'

const STRATEGIES = ['sequential', 'parallel', 'dependency-based', 'leader-delegation'] as const

const STRATEGY_LABEL_KEYS: Record<(typeof STRATEGIES)[number], string> = {
  sequential: 'studio.strategy.sequential',
  parallel: 'studio.strategy.parallel',
  'dependency-based': 'studio.strategy.dependency',
  'leader-delegation': 'studio.strategy.leader'
}

function strategyLabelKey(strategy: (typeof STRATEGIES)[number]): string {
  return STRATEGY_LABEL_KEYS[strategy]
}

interface TeamFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: TeamEntity | null
  onSubmit: (form: TeamForm) => Promise<void> | void
}

export function TeamFormDialog({ open, onOpenChange, initial, onSubmit }: TeamFormDialogProps) {
  const { t } = useTranslation()
  const { providers } = useProviders()
  const { models } = useModels()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [strategy, setStrategy] = useState<(typeof STRATEGIES)[number]>('sequential')
  const [maxConcurrency, setMaxConcurrency] = useState(2)
  const [leaderName, setLeaderName] = useState('')
  const [leaderProvider, setLeaderProvider] = useState('')
  const [leaderModel, setLeaderModel] = useState('')
  const [leaderSystemPrompt, setLeaderSystemPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (initial) {
      setName(initial.name)
      setDescription(initial.description)
      setStrategy(initial.strategy)
      setMaxConcurrency(initial.maxConcurrency)
      setLeaderName(initial.leaderConfig.name)
      setLeaderProvider(initial.leaderConfig.providerId)
      setLeaderModel(initial.leaderConfig.modelId)
      setLeaderSystemPrompt(initial.leaderConfig.systemPrompt)
    } else {
      setName('')
      setDescription('')
      setStrategy('sequential')
      setMaxConcurrency(2)
      setLeaderName('')
      setLeaderProvider('')
      setLeaderModel('')
      setLeaderSystemPrompt('')
    }
  }, [initial, open])

  const leaderModels = useMemo(() => models.filter((m) => m.providerId === leaderProvider), [models, leaderProvider])

  const handleSubmit = async () => {
    if (!name.trim() || !leaderProvider || !leaderModel) return
    setSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        strategy,
        maxConcurrency,
        leaderConfig: {
          name: leaderName.trim() || 'Leader',
          providerId: leaderProvider,
          modelId: leaderModel,
          systemPrompt: leaderSystemPrompt.trim()
        }
      })
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? t('studio.edit') : t('studio.add_team')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>{t('studio.team_name')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Collaborative Team" />
          </div>
          <div className="grid gap-1.5">
            <Label>{t('studio.team_description')}</Label>
            <Textarea.Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('studio.team_description')}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t('studio.strategy')}</Label>
              <Select value={strategy} onValueChange={(v) => setStrategy(v as (typeof STRATEGIES)[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(strategyLabelKey(s))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>{t('studio.max_concurrency')}</Label>
              <Input
                type="number"
                min={1}
                max={16}
                value={maxConcurrency}
                onChange={(e) => setMaxConcurrency(Math.max(1, Math.min(16, Number(e.target.value) || 1)))}
              />
            </div>
          </div>
          <div className="grid gap-1.5 pt-2 border-t">
            <Label className="font-semibold">{t('studio.leader')}</Label>
            <div className="grid gap-1.5">
              <Label>{t('studio.leader_name')}</Label>
              <Input value={leaderName} onChange={(e) => setLeaderName(e.target.value)} placeholder="Leader" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{t('studio.provider')}</Label>
                <Select
                  value={leaderProvider}
                  onValueChange={(v) => {
                    setLeaderProvider(v)
                    setLeaderModel('')
                  }}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('studio.provider')} />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>{t('studio.model')}</Label>
                <Select value={leaderModel} onValueChange={setLeaderModel} disabled={!leaderProvider}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('studio.model')} />
                  </SelectTrigger>
                  <SelectContent>
                    {leaderModels.map((m) => (
                      <SelectItem key={m.id} value={m.apiModelId ?? m.id.split('::')[1]}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>{t('studio.leader_system_prompt')}</Label>
              <Textarea.Input
                value={leaderSystemPrompt}
                onChange={(e) => setLeaderSystemPrompt(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('studio.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !name.trim() || !leaderProvider || !leaderModel}>
            {t('studio.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
