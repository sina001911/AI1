import { createFileRoute } from '@tanstack/react-router'

import { ExplorePage } from '@renderer/pages/explore/ExplorePage'

export const Route = createFileRoute('/app/explore')({
  component: ExploreRoute
})

function ExploreRoute() {
  return <ExplorePage />
}