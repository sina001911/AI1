import { createFileRoute } from '@tanstack/react-router'

import { PromptsPage } from '@renderer/pages/prompts/PromptsPage'

export const Route = createFileRoute('/app/prompts')({
  component: PromptsRoute
})

function PromptsRoute() {
  return <PromptsPage />
}
