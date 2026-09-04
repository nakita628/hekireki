import { hc } from 'hono/client'

import type { createStudioApi } from '../../server/app.js'

type Api = ReturnType<typeof createStudioApi>

type Client = ReturnType<typeof hc<ReturnType<typeof createStudioApi>>>

function hcWithType(...args: Parameters<typeof hc>): Client {
  return hc<Api>(...args)
}

export const client = hcWithType('/').api
