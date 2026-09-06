import { useQuery } from '@tanstack/react-query'
import { parseResponse } from 'hono/client'

import { getDbKey } from '../../hooks/index.js'
import { client } from '../../lib/index.js'
import type { Analysis } from '../../lib/index.js'

export type {
  Analysis,
  Diagnostic,
  GraphEdge,
  GraphNode,
  OutputColumn,
  Parameter,
  Range,
  StatementAnalysis,
} from '../../lib/index.js'

export function getAnalysisQueryKey(sql: string) {
  return [...getDbKey(), '/db/analyze', sql] as const
}

/** The analysis of the text, fetched once per settled edit; the tables come from the Prisma schema. */
export function useAnalysis(sql: string) {
  return useQuery<Analysis, Error, Analysis, ReturnType<typeof getAnalysisQueryKey>>({
    queryKey: getAnalysisQueryKey(sql),
    enabled: sql.trim() !== '',
    placeholderData: (previous) => previous,
    queryFn: ({ signal }) =>
      parseResponse(client.db.analyze.$post({ json: { sql } }, { init: { signal } })),
  })
}
