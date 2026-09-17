import { createFileRoute } from '@tanstack/react-router'

import { MigrateView } from '../features/migrate/migrate-view.js'

export const Route = createFileRoute('/migrate')({ component: MigrateView })
