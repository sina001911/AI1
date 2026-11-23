import { render, screen } from '@testing-library/react'
import { type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MediaToolsPage } from '../MediaToolsPage'

const openRouteMock = vi.hoisted(() => vi.fn())

vi.mock('@renderer/services/mainWindowNavigation', () => ({
  openRoute: (...args: unknown[]) => openRouteMock(...args)
}))

vi.mock('@renderer/hooks/useModel', () => ({
  useModels: () => ({ models: [], isLoading: false })
}))

vi.mock('@renderer/hooks/useProvider', () => ({
  useProviders: () => ({ providers: [], isLoading: false })
}))

vi.mock('@renderer/pages/creativeLab/VideoGenerationPanel', () => ({
  VideoGenerationPanel: (props: { hasConfiguredProvider: boolean; onConfigureProvider: () => void }) => (
    <div data-testid="video-panel" data-configured={String(props.hasConfiguredProvider)}>
      <button onClick={props.onConfigureProvider}>configure</button>
    </div>
  )
}))

vi.mock('@renderer/components/Navbar', () => ({
  Navbar: ({ title, children }: { title?: string; children?: ReactNode }) => (
    <div data-testid="navbar">
      {title}
      {children}
    </div>
  )
}))

vi.mock('@renderer/components/Scrollbar', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) =>
        ({
          'title.media_tools': 'Media Tools',
          'media_tools.video_generation.title': 'Video Generation',
          'media_tools.video_generation.desc': 'Generate short videos from a text prompt.',
          'media_tools.image_generation.title': 'Image Generation',
          'media_tools.image_generation.desc': 'Create images from text descriptions.',
          'media_tools.image_generation.open_studio': 'Open Image Studio',
          'media_tools.file_preview.title': 'Media Files',
          'media_tools.file_preview.desc': 'Browse and preview media files.',
          'media_tools.file_preview.open_files': 'Open Files'
        })[key] ?? key
    })
  }
})

describe('MediaToolsPage', () => {
  beforeEach(() => {
    openRouteMock.mockReset()
  })

  it('renders the video, image, and file sections', () => {
    render(<MediaToolsPage />)

    expect(screen.getByText(/Media Tools/)).toBeInTheDocument()
    expect(screen.getByText(/Video Generation/)).toBeInTheDocument()
    expect(screen.getByText(/Image Generation/)).toBeInTheDocument()
    expect(screen.getByText(/Media Files/)).toBeInTheDocument()
  })

  it('opens the provider settings when the video panel requests configuration', () => {
    render(<MediaToolsPage />)

    const configureButton = screen.getByRole('button', { name: /configure/ })
    configureButton.click()

    expect(openRouteMock).toHaveBeenCalledWith('/app/settings/provider')
  })

  it('navigates to the painting studio from the image card', () => {
    render(<MediaToolsPage />)

    const openStudioButton = screen.getByRole('button', { name: /Open Image Studio/ })
    openStudioButton.click()

    expect(openRouteMock).toHaveBeenCalledWith('/app/paintings')
  })

  it('navigates to the file browser from the media files card', () => {
    render(<MediaToolsPage />)

    const openFilesButton = screen.getByRole('button', { name: /Open Files/ })
    openFilesButton.click()

    expect(openRouteMock).toHaveBeenCalledWith('/app/files')
  })
})
