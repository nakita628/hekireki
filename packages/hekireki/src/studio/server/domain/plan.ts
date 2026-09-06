import * as z from 'zod'

const PlanNode = z
  .object({
    id: z.string().meta({ description: 'The step id.', example: '3' }),
    parent: z.string().nullable().meta({ description: 'The parent step id.', example: null }),
    label: z.string().meta({ description: 'What the step does.', example: 'SCAN users' }),
    detail: z.string().nullable().meta({ description: 'The rest of the line.', example: null }),
    cost: z.number().nullable().meta({ description: 'The estimated cost.', example: null }),
    rows: z.number().nullable().meta({ description: 'The estimated rows.', example: null }),
  })
  .meta({ description: 'One step of an execution plan, flattened' })

type Node = z.infer<typeof PlanNode>

const SqliteRow = z
  .object({
    id: z.coerce.number().meta({ description: 'The step id.', example: 3 }),
    parent: z.coerce
      .number()
      .meta({ description: 'The parent step id, 0 for a root.', example: 0 }),
    detail: z.string().meta({ description: 'What the step does.', example: 'SCAN users' }),
  })
  .meta({ description: 'A row of EXPLAIN QUERY PLAN' })

const MakeSqlitePlanInput = z
  .object({
    rows: z
      .array(z.record(z.string(), z.unknown()))
      .readonly()
      .meta({ description: 'The rows EXPLAIN QUERY PLAN returned.' }),
  })
  .readonly()
  .meta({ description: 'The output of SQLite EXPLAIN QUERY PLAN' })

/** SQLite's `EXPLAIN QUERY PLAN` rows: `id`, `parent` (0 for a root) and `detail`. */
export function makeSqlitePlan(input: z.infer<typeof MakeSqlitePlanInput>) {
  const rows = input.rows.flatMap((row) => {
    const parsed = SqliteRow.safeParse(row)
    return parsed.success ? [parsed.data] : []
  })
  const ids = new Set(rows.map((row) => row.id))
  const nodes: readonly Node[] = rows.map((row) => ({
    id: String(row.id),
    parent: row.parent === 0 || !ids.has(row.parent) ? null : String(row.parent),
    label: row.detail,
    detail: null,
    cost: null,
    rows: null,
  }))
  return {
    nodes,
    raw: rows.map((row) => `${'  '.repeat(depthOf(rows, row.id))}${row.detail}`).join('\n'),
  }
}

function depthOf(rows: readonly z.infer<typeof SqliteRow>[], id: number): number {
  const row = rows.find((candidate) => candidate.id === id)
  if (row === undefined || row.parent === 0) return 0
  return 1 + depthOf(rows, row.parent)
}

const PostgresPlan = z
  .object({
    'Node Type': z.string().meta({ description: 'The operator.', example: 'Seq Scan' }),
    'Relation Name': z.string().optional().meta({ description: 'The table.', example: 'users' }),
    Alias: z.string().optional().meta({ description: 'The alias.', example: 'u' }),
    'Index Name': z.string().optional().meta({ description: 'The index.', example: 'users_pkey' }),
    'Join Type': z.string().optional().meta({ description: 'Inner, Left, ...', example: 'Inner' }),
    'Total Cost': z.number().optional().meta({ description: 'The estimated cost.', example: 1.5 }),
    'Plan Rows': z.number().optional().meta({ description: 'The estimated rows.', example: 10 }),
    'Actual Rows': z.number().optional().meta({ description: 'The rows seen.', example: 10 }),
    Filter: z.string().optional().meta({ description: 'The filter.', example: '(id = 1)' }),
    'Join Filter': z.string().optional().meta({ description: 'The join filter.', example: '' }),
    'Hash Cond': z.string().optional().meta({ description: 'The hash condition.', example: '' }),
    'Merge Cond': z.string().optional().meta({ description: 'The merge condition.', example: '' }),
    'Index Cond': z.string().optional().meta({ description: 'The index condition.', example: '' }),
    'Sort Key': z.array(z.string()).optional().meta({ description: 'The sort keys.' }),
    'Group Key': z.array(z.string()).optional().meta({ description: 'The group keys.' }),
    'CTE Name': z.string().optional().meta({ description: 'The CTE.', example: 'c' }),
    'Subplan Name': z.string().optional().meta({ description: 'The subplan.', example: '' }),
    Plans: z.array(z.unknown()).optional().meta({ description: 'The child plans.' }),
  })
  .meta({ description: 'One node of PostgreSQL EXPLAIN (FORMAT JSON)' })

const PostgresRoot = z
  .array(z.object({ Plan: z.unknown().meta({ description: 'The root plan.' }) }))
  .meta({ description: 'The document EXPLAIN (FORMAT JSON) returns' })

function postgresDetail(plan: z.infer<typeof PostgresPlan>) {
  const parts = [
    plan['Index Name'] === undefined ? null : `using ${plan['Index Name']}`,
    plan['Index Cond'] === undefined ? null : `Index Cond: ${plan['Index Cond']}`,
    plan['Hash Cond'] === undefined ? null : `Hash Cond: ${plan['Hash Cond']}`,
    plan['Merge Cond'] === undefined ? null : `Merge Cond: ${plan['Merge Cond']}`,
    plan['Join Filter'] === undefined ? null : `Join Filter: ${plan['Join Filter']}`,
    plan.Filter === undefined ? null : `Filter: ${plan.Filter}`,
    plan['Sort Key'] === undefined ? null : `Sort Key: ${plan['Sort Key'].join(', ')}`,
    plan['Group Key'] === undefined ? null : `Group Key: ${plan['Group Key'].join(', ')}`,
  ].filter((part) => part !== null)
  return parts.length === 0 ? null : parts.join(' · ')
}

function flattenPostgres(value: unknown, parent: string | null, id: string): readonly Node[] {
  const parsed = PostgresPlan.safeParse(value)
  if (!parsed.success) return []
  const plan = parsed.data
  const target = plan['Relation Name'] ?? plan['CTE Name']
  const alias = plan.Alias !== undefined && plan.Alias !== target ? ` ${plan.Alias}` : ''
  const join = plan['Join Type'] === undefined ? '' : ` (${plan['Join Type']})`
  const label = `${plan['Node Type']}${target === undefined ? '' : ` on ${target}${alias}`}${join}`
  const node: Node = {
    id,
    parent,
    label: plan['Subplan Name'] === undefined ? label : `${plan['Subplan Name']}: ${label}`,
    detail: postgresDetail(plan),
    cost: plan['Total Cost'] ?? null,
    rows: plan['Actual Rows'] ?? plan['Plan Rows'] ?? null,
  }
  return [
    node,
    ...(plan.Plans ?? []).flatMap((child, index) =>
      flattenPostgres(child, id, `${id}.${index + 1}`),
    ),
  ]
}

const MakePostgresPlanInput = z
  .object({
    document: z.unknown().meta({ description: 'The JSON document of the QUERY PLAN column.' }),
  })
  .readonly()
  .meta({ description: 'The output of PostgreSQL EXPLAIN (FORMAT JSON)' })

/** PostgreSQL's `EXPLAIN (FORMAT JSON)`: a tree of `Plan` objects, flattened parents-first. */
export function makePostgresPlan(input: z.infer<typeof MakePostgresPlanInput>) {
  const document = typeof input.document === 'string' ? parseJson(input.document) : input.document
  const root = PostgresRoot.safeParse(document)
  const nodes = root.success
    ? root.data.flatMap((entry, index) => flattenPostgres(entry.Plan, null, String(index + 1)))
    : []
  return { nodes, raw: JSON.stringify(document, null, 2) }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const MysqlTable = z
  .object({
    table_name: z.string().meta({ description: 'The table.', example: 'users' }),
    access_type: z.string().optional().meta({ description: 'The access type.', example: 'ALL' }),
    key: z.string().optional().meta({ description: 'The index used.', example: 'PRIMARY' }),
    rows_examined_per_scan: z
      .number()
      .optional()
      .meta({ description: 'Rows per scan.', example: 3 }),
    rows_produced_per_join: z
      .number()
      .optional()
      .meta({ description: 'Rows produced.', example: 3 }),
    attached_condition: z.string().optional().meta({ description: 'The condition.', example: '' }),
    cost_info: z
      .object({
        read_cost: z.string().optional().meta({ description: 'Read cost.', example: '1' }),
        prefix_cost: z.string().optional().meta({ description: 'Prefix cost.', example: '1' }),
      })
      .optional()
      .meta({ description: 'The cost figures.' }),
  })
  .meta({ description: 'A `table` entry of MySQL EXPLAIN FORMAT=JSON' })

const MysqlBlock = z
  .object({
    select_id: z.number().optional().meta({ description: 'The select id.', example: 1 }),
    cost_info: z
      .object({
        query_cost: z.string().optional().meta({ description: 'The query cost.', example: '1' }),
      })
      .optional()
      .meta({ description: 'The cost figures.' }),
    message: z.string().optional().meta({ description: 'A note instead of a plan.', example: '' }),
  })
  .meta({ description: 'A `query_block` entry of MySQL EXPLAIN FORMAT=JSON' })

const MYSQL_OPERATIONS = new Set([
  'ordering_operation',
  'grouping_operation',
  'duplicates_removal',
  'windowing',
  'nested_loop',
  'table',
  'query_block',
  'materialized_from_subquery',
  'union_result',
  'query_specifications',
  'subqueries',
  'optimized_away_subqueries',
  'attached_subqueries',
  'buffer_result',
])

function flattenMysql(
  value: unknown,
  parent: string | null,
  id: string,
  key: string,
): readonly Node[] {
  if (Array.isArray(value)) {
    // `nested_loop` and its kin hold one entry per input; the array is the operation, its entries feed it.
    const node: Node = {
      id,
      parent,
      label: key.replaceAll('_', ' '),
      detail: null,
      cost: null,
      rows: null,
    }
    return [
      node,
      ...value.flatMap((item, index) => childrenOfMysql(item, id, `${id}.${index + 1}`)),
    ]
  }
  if (typeof value !== 'object' || value === null) return []
  const record = z.record(z.string(), z.unknown()).parse(value)
  if (key === 'table') {
    const table = MysqlTable.safeParse(record)
    if (!table.success) return []
    const parts = [
      table.data.key === undefined ? null : `key ${table.data.key}`,
      table.data.attached_condition ?? null,
    ].filter((part) => part !== null)
    const node: Node = {
      id,
      parent,
      label: `${table.data.access_type ?? 'scan'} ${table.data.table_name}`,
      detail: parts.length === 0 ? null : parts.join(' · '),
      cost:
        Number(
          table.data.cost_info?.prefix_cost ?? table.data.cost_info?.read_cost ?? Number.NaN,
        ) || null,
      rows: table.data.rows_produced_per_join ?? table.data.rows_examined_per_scan ?? null,
    }
    return [node, ...childrenOfMysql(record, id, id)]
  }
  if (key === 'query_block') {
    const block = MysqlBlock.safeParse(record)
    const node: Node = {
      id,
      parent,
      label:
        block.success && block.data.select_id !== undefined
          ? `query block #${block.data.select_id}`
          : 'query block',
      detail: block.success ? (block.data.message ?? null) : null,
      cost: block.success ? Number(block.data.cost_info?.query_cost ?? Number.NaN) || null : null,
      rows: null,
    }
    return [node, ...childrenOfMysql(record, id, id)]
  }
  if (MYSQL_OPERATIONS.has(key)) {
    const node: Node = {
      id,
      parent,
      label: key.replaceAll('_', ' '),
      detail: null,
      cost: null,
      rows: null,
    }
    return [node, ...childrenOfMysql(record, id, id)]
  }
  return childrenOfMysql(record, parent, id)
}

/** The operations nested in an object, numbered under `base` (`1.2` → `1.2.1`, `1.2.2`, ...). */
function childrenOfMysql(value: unknown, parent: string | null, base: string): readonly Node[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return []
  const record = z.record(z.string(), z.unknown()).parse(value)
  return Object.entries(record)
    .filter(
      ([key, child]) => typeof child === 'object' && child !== null && MYSQL_OPERATIONS.has(key),
    )
    .flatMap(([key, child], index) =>
      flattenMysql(child, parent, base === '' ? String(index + 1) : `${base}.${index + 1}`, key),
    )
}

const MakeMysqlPlanInput = z
  .object({
    document: z.unknown().meta({ description: 'The JSON document of the EXPLAIN column.' }),
  })
  .readonly()
  .meta({ description: 'The output of MySQL EXPLAIN FORMAT=JSON' })

/** MySQL's `EXPLAIN FORMAT=JSON`: nested operation objects, flattened parents-first. */
export function makeMysqlPlan(input: z.infer<typeof MakeMysqlPlanInput>) {
  const document = typeof input.document === 'string' ? parseJson(input.document) : input.document
  const nodes = childrenOfMysql(document, null, '')
  return { nodes, raw: JSON.stringify(document, null, 2) }
}
