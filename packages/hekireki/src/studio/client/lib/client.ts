import { hc } from 'hono/client'

import type { createStudioApi } from '../../server/app.js'

export const client = hc<ReturnType<typeof createStudioApi>>('/').api
