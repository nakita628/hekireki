import { hc } from 'hono/client'

import type { api } from '../../server/index.js'

export const client = hc<typeof api>('/api')
