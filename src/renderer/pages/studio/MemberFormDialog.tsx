import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SPECIALIST_ROLES, defaultSystemPrompt, defaultToolPermissions } from '@cherrystudio/agent-team'
import {
  Button,
  Checkbox,
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
import type { TeamMemberEntity, TeamMemberForm } from '@shared/ipc/schemas/ai'

const ROLES = SPECIALIST_ROLES

interface MemberFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: TeamMemberEntity | null
  onSubmit: (form: TeamMemberForm) => Promise<void> | void
}

export function MemberFormDialog({ open, onOpenChange, initial, onSubmit }: MemberFormDialogProps) {
  const { t } = useTranslation()
  const { providers } = useProviders()
  const { models } = useModels()

  const [name, setName] = useState('')
  const [role, setRole] = useState<(typeof ROLES)[number]>('general')
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [orderKey, setOrderKey] = useState('0')
  const [temperature, setTemperature] = useState<number | null>(null)
  const [maxTokens, setMaxTokens] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const memberModels = useMemo(() => models.filter((m) => m.providerId === provider), [models, provider])

  // Reset when the dialog opens or the initial record changes.
  useEffect(() => {
    if (initial) {
      setName(initial.name)
      setRole(initial.role)
      setProvider(initial.providerId)
      setModel(initial.modelId)
      setSystemPrompt(initial.systemPrompt)
      setEnabled(initial.enabled)
      setOrderKey(String(initial.orderKey))
      setTemperature(initial.temperature)
      setMaxTokens(initial.maxTokens)
    } else {
      setName('')
      setRole('general')
      setProvider('')
      setModel('')
      setSystemPrompt(defaultSystemPrompt('general'))
      setEnabled(true)
      setOrderKey('0')
      setTemperature(null)
      setMaxTokens(null)
    }
  }, [initial, open])

  const handleRoleChange = (next: (typeof ROLES)[number]) => {
    setRole(next)
    setSystemPrompt(defaultSystemPrompt(next))
  }

  const handleSubmit = async () => {
    if (!name.trim() || !provider || !model) return
    setSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        role,
        providerId: provider,
        modelId: model,
        temperature,
        maxTokens,
        systemPrompt: systemPrompt.trim(),
        toolPermissions: defaultToolPermissions(role),
        enabled,
        orderKey: orderKey.trim() || '0'
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
          <DialogTitle>{initial ? t('studio.edit') : t('studio.add_specialist')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>{t('studio.specialist_name')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Researcher" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t('studio.specialist_role')}</Label>
              <Select value={role} onValueChange={(v) => handleRoleChange(v as (typeof ROLES)[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>{t('studio.specialist_enabled')}</Label>
              <div className="flex h-9 items-center">
                <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t('studio.provider')}</Label>
              <Select
                value={provider}
                onValueChange={(v) => {
                  setProvider(v)
                  setModel('')
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
              <Label>{t('studio.specialist_model')}</Label>
              <Select value={model} onValueChange={setModel} disabled={!provider}>
                <SelectTrigger>
                  <SelectValue placeholder={t('studio.model')} />
                </SelectTrigger>
                <SelectContent>
                  {memberModels.map((m) => (
                    <SelectItem key={m.id} value={m.apiModelId ?? m.id.split('::')[1]}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>{t('studio.specialist_system_prompt')}</Label>
            <Textarea.Input value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('studio.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !name.trim() || !provider || !model}>
            {t('studio.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
