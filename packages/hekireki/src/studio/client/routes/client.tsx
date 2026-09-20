import { createFileRoute } from '@tanstack/react-router'

import { ClientView } from '../features/client/client-view.js'

export const Route = createFileRoute('/client')({ component: ClientView })
