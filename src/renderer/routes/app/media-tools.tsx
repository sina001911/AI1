import { createFileRoute } from '@tanstack/react-router'

import { MediaToolsPage } from '@renderer/pages/mediaTools/MediaToolsPage'

export const Route = createFileRoute('/app/media-tools')({
  component: MediaToolsRoute
})

function MediaToolsRoute() {
  return <MediaToolsPage />
}
