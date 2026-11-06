import { createFileRoute } from '@tanstack/react-router'

import { WorkflowsPage } from '@renderer/pages/workflows/WorkflowsPage'

export const Route = createFileRoute('/app/workflows')({
  component: WorkflowsRoute
})

function WorkflowsRoute() {
  return <WorkflowsPage />
}