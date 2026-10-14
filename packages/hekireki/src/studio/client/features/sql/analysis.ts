import { useQuery } from '@tanstack/react-query'
import { parseResponse } from 'hono/client'

import { dbClient } from '../../api/index.js'
import { getDbKey } from '../../hooks/index.js'

/** The analysis of the text, fetched once per settled edit; the tables come from the Prisma schema. */
export function useAnalysis(sql: string) {
  return useQuery({
    queryKey: [...getDbKey(), '/db/analyze', sql] as const,
    queryFn: ({ signal }) =>
      parseResponse(dbClient.db.analyze.$post({ json: { sql } }, { init: { signal } })),
    enabled: sql.trim() !== '',
    placeholderData: (previous) => previous,
  })
}
