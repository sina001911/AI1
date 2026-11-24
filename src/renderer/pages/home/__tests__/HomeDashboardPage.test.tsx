import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import HomeDashboardPage from '../HomeDashboardPage'

const navigateMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  getRouteApi: () => ({ useSearch: () => ({}) })
}))

vi.mock('@renderer/hooks/useModel', () => ({
  useModels: () => ({ models: [], isLoading: false })
}))

vi.mock('@renderer/hooks/useProvider', () => ({
  useProviders: () => ({ providers: [], isLoading: false })
}))

vi.mock('@renderer/hooks/useTopic', () => ({
  useTopics: () => ({ topics: [], isLoading: false })
}))

vi.mock('@renderer/components/history/components/HistoryTableParts', () => ({
  formatHistoryTime: (value: string) => value
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
          'home_dashboard.hero.title': 'Your Unified AI Workspace',
          'home_dashboard.hero.subtitle': 'One Platform. Infinite Possibilities.',
          'home_dashboard.popular_models.title': 'Popular Models',
          'home_dashboard.system_status.connected_models': 'Connected Models',
          'home_dashboard.recent_conversations.title': 'Recent Conversations',
          'home_dashboard.quick_actions.title': 'Workspaces',
          'home_dashboard.quick.chat': 'Chat',
          'home_dashboard.quick.studio': 'Studio',
          'home_dashboard.quick.agents': 'Agents',
          'home_dashboard.quick.paintings': 'Paintings',
          'home_dashboard.quick.creative_lab': 'Creative Lab',
          'home_dashboard.empty_conversations': 'No recent conversations.',
          'home_dashboard.empty': 'No models yet.'
        })[key] ?? key
    })
  }
})

describe('HomeDashboardPage', () => {
  beforeEach(() => {
    navigateMock.mockReset()
  })

  it('renders the hero and quick-action workspaces', () => {
    render(<HomeDashboardPage />)

    expect(screen.getByText(/Your Unified AI Workspace/)).toBeInTheDocument()
    expect(screen.getByText(/One Platform. Infinite Possibilities./)).toBeInTheDocument()
    expect(screen.getByText(/Workspaces/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Chat/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Studio/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Agents/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Paintings/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Creative Lab/ })).toBeInTheDocument()
  })

  it('navigates to the requested workspace when a quick action is clicked', async () => {
    const user = userEvent.setup()
    render(<HomeDashboardPage />)

    await user.click(screen.getByRole('button', { name: /Studio/ }))

    expect(navigateMock).toHaveBeenCalledWith({ to: '/app/studio' })
  })

  it('shows the empty state when there are no recent conversations', () => {
    render(<HomeDashboardPage />)

    expect(screen.getByText(/No recent conversations./)).toBeInTheDocument()
  })
})
