import { createFileRoute } from '@tanstack/react-router'

import { StudioPage } from '@renderer/pages/studio/StudioPage'

export const Route = createFileRoute('/app/studio')({
  component: StudioRoute
})

function StudioRoute() {
  return <StudioPage />
}
