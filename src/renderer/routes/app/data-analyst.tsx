import { createFileRoute } from '@tanstack/react-router'

import { DataAnalystPage } from '@renderer/pages/dataAnalyst/DataAnalystPage'

export const Route = createFileRoute('/app/data-analyst')({
  component: DataAnalystRoute
})

function DataAnalystRoute() {
  return <DataAnalystPage />
}
