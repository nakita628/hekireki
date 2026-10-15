import type { InferResponseType } from 'hono/client'

import type { migrateClient } from '../../api/index.js'

type Check = InferResponseType<typeof migrateClient.migrate.plan.$post, 200>['checks'][number]

/** A check whose change takes rows or values out of the database, with some there to take. */
export function losesData(check: Pick<Check, 'lost' | 'count'>) {
  return check.lost !== null && (check.count ?? 0) > 0
}
