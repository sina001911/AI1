import { Palette, SlidersHorizontal, Type } from 'lucide-react'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@cherrystudio/ui'
import { usePreference } from '@data/hooks/usePreference'
import { loggerService } from '@logger'
import { Navbar } from '@renderer/components/Navbar'
import Scrollbar from '@renderer/components/Scrollbar'
import { useTheme } from '@renderer/hooks/useTheme'
import i18n from '@renderer/i18n/resolver'
import { LanguageVarious, ThemeMode } from '@shared/data/preference/preferenceTypes'

const logger = loggerService.withContext('PersonalizationPage')

const THEME_OPTIONS: { value: ThemeMode; label: string; swatch: string }[] = [
  { value: ThemeMode.light, label: 'Light', swatch: 'from-slate-200 to-slate-100' },
  { value: ThemeMode.dark, label: 'Dark', swatch: 'from-slate-900 to-slate-800' },
  { value: ThemeMode.system, label: 'System', swatch: 'from-primary/70 to-primary/30' }
]

const LANGUAGE_OPTIONS: { value: LanguageVarious; label: string }[] = [
  { value: 'en-US', label: 'English' },
  { value: 'zh-CN', label: '中文' },
  { value: 'fa-IR', label: 'فارسی' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'es-ES', label: 'Español' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'it-IT', label: 'Italiano' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'pt-PT', label: 'Português' },
  { value: 'ru-RU', label: 'Русский' },
  { value: 'tr-TR', label: 'Türkçe' },
  { value: 'vi-VN', label: 'Tiếng Việt' },
  { value: 'th-TH', label: 'ไทย' },
  { value: 'el-GR', label: 'Ελληνικά' },
  { value: 'ro-RO', label: 'Română' },
  { value: 'zh-TW', label: '繁體中文' }
]

export const PersonalizationPage: FC = () => {
  const { t } = useTranslation()
  const [settedTheme] = usePreference('ui.theme_mode')
  const [language, setLanguage] = usePreference('app.language')
  const { setTheme } = useTheme()

  const handleTheme = (mode: ThemeMode) => {
    logger.info('Theme selected', { mode })
    setTheme(mode)
  }

  const handleLanguage = (value: LanguageVarious) => {
    logger.info('Language selected', { value })
    void setLanguage(value)
    void i18n.changeLanguage(value)
  }

  return (
    <div className="flex h-full flex-col">
      <Navbar title={t('title.personalization')} />
      <Scrollbar className="flex-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-border-subtle bg-accent/40">
              <SlidersHorizontal className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">{t('title.personalization')}</h1>
              <p className="text-sm text-muted-foreground">
                Tune how AI1 looks, feels, and behaves — themes, density, language, and default team composition.
              </p>
            </div>
          </div>

          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Palette className="size-4 text-primary" />
              <h2 className="text-sm font-medium text-foreground">Appearance</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {THEME_OPTIONS.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={`group flex flex-col gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-accent/40 ${
                    settedTheme === mode.value ? 'border-primary bg-primary/5' : 'border-border-subtle bg-card'
                  }`}
                  onClick={() => handleTheme(mode.value)}>
                  <span className={`size-8 rounded-lg border border-border-subtle bg-gradient-to-br ${mode.swatch}`} />
                  <span className="text-sm font-medium text-foreground">{mode.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Type className="size-4 text-primary" />
              <h2 className="text-sm font-medium text-foreground">Language</h2>
            </div>
            <div className="rounded-xl border border-border-subtle bg-card p-4">
              <p className="text-sm text-muted-foreground">
                AI1 ships with bilingual Persian + English support. Switch the active locale from the language switcher
                in the sidebar.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {LANGUAGE_OPTIONS.map((lang) => (
                  <button
                    key={lang.value}
                    type="button"
                    className={`rounded-md px-2 py-1 text-xs transition-colors ${
                      language === lang.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-accent/50 text-muted-foreground hover:bg-accent'
                    }`}
                    onClick={() => handleLanguage(lang.value)}>
                    {lang.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Active locale: {language ?? 'system-default'}</p>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-foreground">Default team</h2>
            <div className="rounded-xl border border-border-subtle bg-card p-4">
              <p className="text-sm text-muted-foreground">
                Choose which specialist roles AI1 prefers when forming a new team from a project objective.
              </p>
              <Button
                variant="outline"
                className="mt-3 gap-2"
                onClick={() => logger.info('Default team editor requested')}>
                Configure default team
              </Button>
            </div>
          </section>
        </div>
      </Scrollbar>
    </div>
  )
}

export default PersonalizationPage
