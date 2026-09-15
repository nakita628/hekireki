// What the Prisma Client page asks the server while the query is being typed: the reading of the
// text (its calls, and what keeps it from running) and TypeScript's check of it.
import { queryOptions, useQuery } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { parseResponse } from 'hono/client'

import { getClientKey } from '../../hooks/index.js'
import { client } from '../../lib/index.js'

function analysisOptions(query: string) {
  return queryOptions({
    queryKey: [...getClientKey(), '/client/analyze', query] as const,
    queryFn: ({ signal }) =>
      parseResponse(client.client.analyze.$post({ json: { query } }, { init: { signal } })),
  })
}

/** The analysis of exactly this text, from the cache when it is there; null when it cannot be had. */
export async function readAnalysis(queryClient: QueryClient, query: string) {
  try {
    return await queryClient.query(analysisOptions(query))
  } catch {
    return null
  }
}

/** The calls and problems of the text, read by the server once per settled edit. */
export function useClientAnalysis(query: string) {
  return useQuery({
    ...analysisOptions(query),
    enabled: query.trim() !== '',
    placeholderData: (previous) => previous,
  })
}

/**
 * The SQL a call that only reads sends, from running it once per settled text. The same text
 * sends the same SQL, so it is not run again until it changes.
 */
export function useClientPreview(query: string, enabled: boolean) {
  return useQuery({
    queryKey: [...getClientKey(), '/client/preview', query] as const,
    queryFn: ({ signal }) =>
      parseResponse(client.client.preview.$post({ json: { query } }, { init: { signal } })),
    enabled: enabled && query.trim() !== '',
    placeholderData: (previous) => previous,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
}

/** What TypeScript finds wrong with the settled text, once the project has a TypeScript to ask. */
export function useTypeCheck(query: string, enabled: boolean) {
  return useQuery({
    queryKey: [...getClientKey(), '/client/check', query] as const,
    queryFn: ({ signal }) =>
      parseResponse(client.client.check.$post({ json: { query } }, { init: { signal } })),
    enabled: enabled && query.trim() !== '',
    placeholderData: (previous) => previous,
  })
}
