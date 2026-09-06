import type { parseResponse } from 'hono/client'

import type { client } from './client.js'

/** The body of a successful response of one client method, as `parseResponse` types it. */
type Body<Call extends (...args: never[]) => Promise<unknown>> = Awaited<
  ReturnType<typeof parseResponse<Awaited<ReturnType<Call>>>>
>

export type Analysis = Body<typeof client.db.analyze.$post>

export type StatementAnalysis = Analysis['statements'][number]

export type GraphNode = StatementAnalysis['nodes'][number]

export type GraphEdge = StatementAnalysis['edges'][number]

export type OutputColumn = StatementAnalysis['columns'][number]

export type Parameter = StatementAnalysis['parameters'][number]

export type Diagnostic = StatementAnalysis['diagnostics'][number]

export type Range = { readonly start: number; readonly end: number }

export type SqlResult = Body<typeof client.db.sql.$post>

export type Plan = Body<typeof client.db.explain.$post>
