import { Bell, CircleArrowUp, Search, Settings } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  AvatarFallback,
  AvatarImage,
  Button,
  EmptyState,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip
} from '@cherrystudio/ui'
import { usePersistCache } from '@data/hooks/useCache'
import { usePreference } from '@data/hooks/usePreference'
import { loggerService } from '@logger'
import { CommandTooltip } from '@renderer/components/command'
import GlobalSearchPopup from '@renderer/components/GlobalSearch/GlobalSearchPopup'
import { getSidebarLayout } from '@renderer/components/Sidebar'
import { UserAccountPanel } from '@renderer/components/UserAccountPanel'
import { useAppUpdateState } from '@renderer/hooks/useAppUpdateState'
import useAvatar from '@renderer/hooks/useAvatar'
import { openSettingsTab } from '@renderer/services/mainWindowNavigation'

import { WindowControls } from '../WindowControls'

const logger = loggerService.withContext('UnifiedTopbar')

export function AppUpdateButton({ placement = 'bottom' }: { placement?: 'top' | 'right' | 'bottom' | 'left' }) {
  const { t } = useTranslation()
  const { appUpdateState } = useAppUpdateState()
  const hasUpdateAction = Boolean(appUpdateState.available && appUpdateState.downloaded && appUpdateState.info)

  if (!hasUpdateAction) return null

  const handleUpdateClick = () => {
    const releaseInfo = appUpdateState.info
    if (!releaseInfo) return
    void import('@renderer/components/UpdateDialogPopup')
      .then(({ default: UpdateDialogPopup }) => UpdateDialogPopup.show({ releaseInfo }))
      .catch((error) => logger.error('Failed to open update dialog', error as Error))
  }

  const updateLabel = appUpdateState.info
    ? t('settings.about.updateAvailable', { version: appUpdateState.info.version })
    : t('button.update_available')

  return (
    <Tooltip content={updateLabel} placement={placement} delay={800}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={updateLabel}
        onClick={handleUpdateClick}
        className="flex size-8 shrink-0 items-center justify-center rounded-full transition-[background-color] duration-[160ms] hover:bg-accent">
        <CircleArrowUp className="lucide-custom size-[18px] text-success" strokeWidth={1.8} />
      </Button>
    </Tooltip>
  )
}

function TopbarSearch() {
  const { t } = useTranslation()
  const handleSearchClick = () => {
    void GlobalSearchPopup.show()
  }
  return (
    <CommandTooltip command="app.search" label={t('globalSearch.open')} placement="bottom" delay={800}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('globalSearch.open')}
        onClick={handleSearchClick}
        className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground dark:text-muted-foreground">
        <Search size={16} strokeWidth={1.8} />
      </Button>
    </CommandTooltip>
  )
}

function TopbarNotifications() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('common.notifications', { defaultValue: 'Notifications' })}
          className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground dark:text-muted-foreground">
          <Bell size={16} strokeWidth={1.8} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="w-80 rounded-md border border-border p-0 bg-popover shadow-lg">
        <EmptyState
          compact
          title={t('notifications.empty_title', { defaultValue: 'هیچ نوتیفیکیشنی نیست' })}
          description={t('notifications.empty_desc', {
            defaultValue: 'هیچ رویداد سیستمی یا هشدار skutونی ثبت نشده است.'
          })}
        />
      </PopoverContent>
    </Popover>
  )
}

function TopbarUser() {
  const { t } = useTranslation()
  const [userName] = usePreference('app.user.name')
  const avatar = useAvatar()
  const [open, setOpen] = useState(false)
  const label = userName || t('common.account', { defaultValue: 'حساب کاربری' })
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full overflow-hidden text-muted-foreground transition-colors hover:bg-accent hover:text-foreground dark:text-muted-foreground">
          <AvatarImage src={avatar} />
          <AvatarFallback>{userName?.slice(0, 1).toUpperCase() || 'A'}</AvatarFallback>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="w-56 rounded-md border border-border p-0 bg-popover shadow-lg">
        <UserAccountPanel onRequestClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

export function UnifiedTopbar() {
  const { t } = useTranslation()
  const [sidebarWidth] = usePersistCache('ui.sidebar.width')
  const sidebarLayout = getSidebarLayout(sidebarWidth)
  const { appUpdateState } = useAppUpdateState()
  const hasUpdateAction = Boolean(appUpdateState.available && appUpdateState.downloaded && appUpdateState.info)

  return (
    <div className="flex h-full shrink-0 items-stretch">
      <div className="flex items-center gap-1 pr-2 [-webkit-app-region:no-drag]">
        {hasUpdateAction && <AppUpdateButton placement="right" />}
        <TopbarSearch />
        <TopbarNotifications />
        <TopbarUser />
        {sidebarLayout === 'hidden' && (
          <CommandTooltip command="app.settings.open" label={t('settings.title')} placement="bottom" delay={800}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('settings.title')}
              onClick={() => openSettingsTab()}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground dark:text-muted-foreground">
              <Settings size={16} strokeWidth={1.8} />
            </Button>
          </CommandTooltip>
        )}
      </div>
      <WindowControls />
    </div>
  )
}
