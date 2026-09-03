import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext } from '@tanstack/react-router'

import { Shell } from '../features/shell/shell.js'

export const Route = createRootRouteWithContext<{ readonly queryClient: QueryClient }>()({
  component: Shell,
})
