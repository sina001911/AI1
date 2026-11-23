import { createFileRoute } from '@tanstack/react-router'

import HomeDashboardPage from '@renderer/pages/home/HomeDashboardPage'

export const Route = createFileRoute('/app/home')({
  component: HomeDashboardPage
})
