import { MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Scrollbar,
  Skeleton
} from '@cherrystudio/ui'
import { useDataChange, useQuery } from '@data/hooks/useDataApi'
import { PromptEditDialog } from '@renderer/components/resourceCatalog/dialogs/edit'
import { usePromptMutations, usePromptMutationsById } from '@renderer/hooks/resourceCatalog'
import { toast } from '@renderer/services/toast'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import type { Prompt, PromptVisibility } from '@shared/data/types/prompt'

type PromptDialogState = { prompt: Prompt | null } | null

export function PromptsPage() {
  const { t } = useTranslation()
  const [promptDialog, setPromptDialog] = useState<PromptDialogState>(null)
  const [deleteTarget, setDeleteTarget] = useState<Prompt | null>(null)
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [deletingPrompt, setDeletingPrompt] = useState(false)

  const { data, error, isLoading, refetch } = useQuery('/prompts', {})
  const prompts = useMemo(() => data ?? [], [data])
  const { createPrompt } = usePromptMutations()
  const { updatePrompt, deletePrompt } = usePromptMutationsById(deleteTarget?.id ?? '')

  useDataChange('/prompts', () => void refetch())

  const handleSavePrompt = useCallback(
    async (payload: { title: string; content: string; visibility: PromptVisibility }) => {
      setSavingPrompt(true)
      try {
        if (promptDialog?.prompt) {
          await updatePrompt(payload)
        } else {
          await createPrompt(payload)
        }
        setPromptDialog(null)
      } catch (err) {
        toast.error(
          formatErrorMessageWithPrefix(
            err,
            t(promptDialog?.prompt ? 'settings.prompts.errors.updateFailed' : 'settings.prompts.errors.createFailed')
          )
        )
        throw err
      } finally {
        setSavingPrompt(false)
      }
    },
    [createPrompt, promptDialog, t, updatePrompt]
  )

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return

    setDeletingPrompt(true)
    try {
      await deletePrompt()
      setDeleteTarget(null)
    } catch (err) {
      toast.error(formatErrorMessageWithPrefix(err, t('settings.prompts.errors.deleteFailed')))
      throw err
    } finally {
      setDeletingPrompt(false)
    }
  }, [deletePrompt, deleteTarget, t])

  return (
    <div className="min-h-0 flex-1 overflow-hidden flex-col">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 pt-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="text-lg font-semibold text-foreground">{t('title.prompts')}</h2>
        </div>
        <Button size="sm" onClick={() => setPromptDialog({ prompt: null })}>
          <Plus size={12} />
          {t('common.add')}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4">
        {error ? (
          <div className="flex min-h-full items-center justify-center p-4">
            <Alert
              type="error"
              showIcon
              message={t('settings.prompts.errors.loadFailed')}
              description={error.message}
              action={
                <Button variant="outline" size="sm" onClick={() => void refetch()}>
                  {t('common.retry')}
                </Button>
              }
              className="max-w-lg rounded-md px-4 py-3 shadow-none"
            />
          </div>
        ) : isLoading ? (
          <PromptListSkeleton />
        ) : prompts.length === 0 ? (
          <EmptyState
            compact
            title={t('library.empty_state.no_match_title')}
            description={t('settings.prompts.noPrompts')}
            className="py-14"
          />
        ) : (
          <Scrollbar className="min-h-0 flex-1 pb-3">
            {prompts.map((prompt) => (
              <PromptRow
                key={prompt.id}
                prompt={prompt}
                onEdit={() => setPromptDialog({ prompt })}
                onDelete={() => setDeleteTarget(prompt)}
              />
            ))}
          </Scrollbar>
        )}
      </div>

      <PromptEditDialog
        open={promptDialog !== null}
        prompt={promptDialog?.prompt ?? null}
        saving={savingPrompt}
        onSave={handleSavePrompt}
        onCancel={() => {
          if (!savingPrompt) setPromptDialog(null)
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deletingPrompt) setDeleteTarget(null)
        }}
        title={t('settings.prompts.delete')}
        description={t('settings.prompts.deleteConfirm')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        destructive
        confirmLoading={deletingPrompt}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

function PromptListSkeleton() {
  return (
    <div className="space-y-2 pb-3" data-testid="prompts-page-loading">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
          <Skeleton className="size-6 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-full" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}

function PromptRow({ prompt, onDelete, onEdit }: { prompt: Prompt; onDelete: () => void; onEdit: () => void }) {
  const { t } = useTranslation()
  const summary = prompt.content.replace(/\s+/g, ' ').trim()

  return (
    <div className="group flex items-center gap-3 rounded-lg border border-border px-3 py-2 transition-[border-color] hover:border-border-strong">
      <Button
        variant="ghost"
        aria-label={`${t('common.edit')} ${prompt.title}`}
        onClick={onEdit}
        className="h-auto min-w-0 flex-1 justify-start whitespace-normal rounded-md p-0 text-left hover:bg-transparent">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground text-sm leading-5">{prompt.title}</span>
          <span className="mt-0.5 block truncate text-muted-foreground text-xs leading-5">{summary}</span>
        </span>
      </Button>
      {prompt.visibility === 'global' ? (
        <Badge variant="secondary" className="border-0 font-normal text-muted-foreground">
          {t('settings.prompts.visibility.global.badge')}
        </Badge>
      ) : (
        <Badge variant="outline" className="border-0 font-normal text-muted-foreground">
          {t('settings.prompts.visibility.restricted.badge')}
        </Badge>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`${t('common.more')} ${prompt.title}`}>
            <MoreHorizontal size={13} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              aria-label={`${t('common.delete')} ${prompt.title}`}
              onSelect={onDelete}>
              <Trash2 />
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
