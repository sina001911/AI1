import { createFileRoute } from '@tanstack/react-router'

import { CreativeLabPage } from '@renderer/pages/creativeLab/CreativeLabPage'

export const Route = createFileRoute('/app/creative-lab')({
  component: CreativeLabRoute
})

function CreativeLabRoute() {
  return <CreativeLabPage />
}
