import { createFileRoute } from '@tanstack/react-router'

import { SqlView } from '@/features/sql/sql-view.js'

export const Route = createFileRoute('/sql')({ component: SqlView })
