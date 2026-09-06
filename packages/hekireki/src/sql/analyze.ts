/**
 * The analysis: a parsed statement against the schema becomes a data-flow graph (what feeds
 * what, from the tables up to the result), the lineage of every output column, the row type a
 * driver would hand back, the type of every placeholder, and the problems found on the way.
 *
 * Every relation a query reads — a table, a CTE, a subquery — is a node; every clause that
 * changes the rows — a join, a filter, a grouping, the projection, a sort, a limit — is a node
 * after it; and a subquery inside an expression feeds the clause it sits in with a `lookup`
 * edge. Column references are resolved through the scopes of the query, outer scopes included,
 * so a correlated subquery reads the row of the query around it.
 */
import type {
  Cte,
  Expr,
  FromItem,
  OrderItem,
  Query,
  QueryBody,
  Range,
  SelectCore,
  SelectItem,
  Statement,
  TableName,
} from './ast.js'
import { parseStatements } from './parse.js'
import { literalDataType, toTsType } from './types.js'
import type { Dialect } from './types.js'

export type SchemaColumn = {
  readonly name: string
  readonly dataType: string
  readonly nullable: boolean
}

export type SchemaTable = {
  readonly name: string
  readonly columns: readonly SchemaColumn[]
}

export type AnalysisSchema = {
  readonly dialect: Dialect
  readonly tables: readonly SchemaTable[]
}

export type NodeKind =
  | 'table'
  | 'cte'
  | 'subquery'
  | 'values'
  | 'function'
  | 'join'
  | 'filter'
  | 'aggregate'
  | 'having'
  | 'project'
  | 'distinct'
  | 'sort'
  | 'limit'
  | 'union'
  | 'insert'
  | 'update'
  | 'delete'
  | 'returning'

export type NodeColumn = {
  readonly name: string
  readonly dataType: string | null
  readonly used: boolean
}

export type GraphNode = {
  readonly id: string
  readonly kind: NodeKind
  readonly label: string
  readonly details: readonly string[]
  readonly range: Range | null
  readonly scope: string
  readonly columns: readonly NodeColumn[]
}

export type GraphEdge = {
  readonly id: string
  readonly source: string
  readonly target: string
  readonly label: string | null
  readonly kind: 'flow' | 'lookup'
}

export type ColumnSource = { readonly table: string; readonly column: string }

export type OutputColumn = {
  readonly name: string
  readonly expression: string
  readonly dataType: string | null
  readonly tsType: string
  readonly nullable: boolean | null
  readonly sources: readonly ColumnSource[]
}

export type TableRef = {
  readonly nodeId: string
  readonly name: string
  readonly alias: string | null
  readonly scope: string
  readonly known: boolean
  readonly columnsUsed: readonly string[]
  readonly range: Range
}

export type Parameter = {
  readonly index: number
  readonly placeholder: string
  readonly dataType: string | null
  readonly tsType: string
  readonly nullable: boolean | null
  readonly context: string
}

export type Diagnostic = {
  readonly severity: 'error' | 'warning' | 'info'
  readonly message: string
  readonly range: Range | null
}

export type StatementKind = 'select' | 'insert' | 'update' | 'delete' | 'other' | 'invalid'

export type StatementAnalysis = {
  readonly kind: StatementKind
  readonly text: string
  readonly range: Range
  readonly nodes: readonly GraphNode[]
  readonly edges: readonly GraphEdge[]
  readonly tables: readonly TableRef[]
  readonly columns: readonly OutputColumn[]
  readonly parameters: readonly Parameter[]
  readonly diagnostics: readonly Diagnostic[]
  readonly rowType: string
  readonly paramsType: string
}

export type Analysis = { readonly statements: readonly StatementAnalysis[] }

// --- internal shapes ---------------------------------------------------------------------------

type TypeInfo = {
  readonly dataType: string | null
  readonly tsType: string
  readonly nullable: boolean | null
  readonly sources: readonly ColumnSource[]
}

type Resolved = TypeInfo & { readonly name: string; readonly expression: string }

type Relation = {
  /** The name a column reference qualifies with, lowercased. */
  readonly key: string
  readonly display: string
  readonly nodeId: string
  readonly columns: readonly Resolved[]
  /** Whether the column list is complete, so an unknown column is a mistake rather than a gap. */
  readonly known: boolean
  /** The base table for lineage of an unknown column, when there is one. */
  readonly tableName: string | null
  readonly outerNullable: boolean
  readonly used: Set<string>
}

type Scope = {
  readonly relations: readonly Relation[]
  readonly outer: Scope | null
  readonly ctes: ReadonlyMap<
    string,
    { readonly nodeId: string; readonly columns: readonly Resolved[] }
  >
}

type MutableTableRef = {
  readonly nodeId: string
  readonly name: string
  readonly alias: string | null
  readonly scope: string
  readonly known: boolean
  readonly range: Range
  readonly used: Set<string>
  readonly schemaColumns: readonly SchemaColumn[]
}

type Context = {
  readonly dialect: Dialect
  readonly text: string
  readonly tables: ReadonlyMap<string, SchemaTable>
  readonly nodes: GraphNode[]
  readonly edges: GraphEdge[]
  readonly refs: MutableTableRef[]
  readonly diagnostics: Diagnostic[]
  readonly params: {
    readonly placeholder: string
    readonly type: TypeInfo
    readonly context: string
    readonly range: Range
  }[]
  counter: number
}

const UNKNOWN: TypeInfo = { dataType: null, tsType: 'unknown', nullable: null, sources: [] }

function nextId(ctx: Context) {
  ctx.counter += 1
  return `n${ctx.counter}`
}

function snippet(ctx: Context, range: Range | null, limit = 120) {
  if (range === null) return ''
  const text = ctx.text.slice(range.start, range.end).replaceAll(/\s+/gu, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

function addNode(ctx: Context, node: Omit<GraphNode, 'id'>) {
  const id = nextId(ctx)
  ctx.nodes.push({ id, ...node })
  return id
}

function addEdge(
  ctx: Context,
  source: string,
  target: string,
  label: string | null = null,
  kind: 'flow' | 'lookup' = 'flow',
) {
  ctx.edges.push({ id: `${source}->${target}:${ctx.edges.length}`, source, target, label, kind })
}

function warn(
  ctx: Context,
  message: string,
  range: Range | null,
  severity: Diagnostic['severity'] = 'warning',
) {
  ctx.diagnostics.push({ severity, message, range })
}

function typeOfColumn(ctx: Context, column: SchemaColumn): TypeInfo {
  return {
    dataType: column.dataType,
    tsType: toTsType(ctx.dialect, column.dataType),
    nullable: column.nullable,
    sources: [],
  }
}

function nullableOr(...types: readonly TypeInfo[]): boolean | null {
  if (types.some((type) => type.nullable === true)) return true
  if (types.every((type) => type.nullable === false)) return false
  return null
}

function withNullable(type: TypeInfo, nullable: boolean | null): TypeInfo {
  return { ...type, nullable }
}

function booleanType(
  ctx: Context,
  nullable: boolean | null,
  sources: readonly ColumnSource[],
): TypeInfo {
  return {
    dataType: literalDataType(ctx.dialect, 'boolean'),
    tsType: toTsType(ctx.dialect, literalDataType(ctx.dialect, 'boolean')),
    nullable,
    sources,
  }
}

function numberType(
  ctx: Context,
  nullable: boolean | null,
  sources: readonly ColumnSource[],
): TypeInfo {
  return { dataType: literalDataType(ctx.dialect, 'number'), tsType: 'number', nullable, sources }
}

function stringType(
  ctx: Context,
  nullable: boolean | null,
  sources: readonly ColumnSource[],
): TypeInfo {
  return { dataType: literalDataType(ctx.dialect, 'string'), tsType: 'string', nullable, sources }
}

function sourcesOf(...types: readonly TypeInfo[]): readonly ColumnSource[] {
  const seen = new Set<string>()
  return types
    .flatMap((type) => type.sources)
    .filter((source) => {
      const key = `${source.table}.${source.column}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

// --- column resolution ---------------------------------------------------------------------------

function findRelation(scope: Scope | null, qualifier: string): Relation | null {
  if (scope === null) return null
  const key = qualifier.toLowerCase()
  return (
    scope.relations.find((relation) => relation.key === key) ?? findRelation(scope.outer, qualifier)
  )
}

function columnOf(relation: Relation, name: string) {
  const lower = name.toLowerCase()
  return relation.columns.find((column) => column.name.toLowerCase() === lower) ?? null
}

function fromRelation(relation: Relation, name: string): TypeInfo {
  relation.used.add(name)
  const column = columnOf(relation, name)
  if (column !== null) {
    return { ...column, nullable: relation.outerNullable ? true : column.nullable }
  }
  return {
    ...UNKNOWN,
    nullable: relation.outerNullable ? true : null,
    sources: relation.tableName === null ? [] : [{ table: relation.tableName, column: name }],
  }
}

/** The column a reference names, found in the nearest scope that has it. */
function resolveColumn(
  ctx: Context,
  scope: Scope,
  qualifier: string | null,
  name: string,
  range: Range,
  aliases: ReadonlyMap<string, TypeInfo> | null,
): TypeInfo {
  if (qualifier !== null) {
    const relation = findRelation(scope, qualifier)
    if (relation === null) {
      warn(ctx, `"${qualifier}" is not a table or alias in scope`, range)
      return UNKNOWN
    }
    if (relation.known && columnOf(relation, name) === null) {
      warn(ctx, `"${relation.display}" has no column "${name}"`, range)
    }
    return fromRelation(relation, name)
  }
  const aliased = aliases?.get(name.toLowerCase())
  if (aliased !== undefined) return aliased
  const search = (current: Scope | null): TypeInfo | null => {
    if (current === null) return null
    const lower = name.toLowerCase()
    const holders = current.relations.filter((relation) => columnOf(relation, lower) !== null)
    const first = holders[0]
    if (first !== undefined) {
      if (holders.length > 1) {
        warn(
          ctx,
          `"${name}" is ambiguous: it is a column of ${holders.map((relation) => `"${relation.display}"`).join(' and ')}`,
          range,
        )
      }
      return fromRelation(first, name)
    }
    const unknowns = current.relations.filter((relation) => !relation.known)
    const only = unknowns[0]
    if (only !== undefined && unknowns.length === 1 && current.relations.length === 1) {
      return fromRelation(only, name)
    }
    if (unknowns.length > 0) return { ...UNKNOWN }
    return search(current.outer)
  }
  const found = search(scope)
  if (found !== null) return found
  if (scope.relations.length > 0 || scope.outer !== null) {
    warn(ctx, `Unknown column "${name}"`, range)
  }
  return UNKNOWN
}

// --- expression typing -----------------------------------------------------------------------------

const AGGREGATES = new Set([
  'count',
  'sum',
  'avg',
  'min',
  'max',
  'total',
  'group_concat',
  'string_agg',
  'array_agg',
  'json_agg',
  'jsonb_agg',
  'json_group_array',
  'json_group_object',
  'bool_and',
  'bool_or',
  'every',
  'json_arrayagg',
  'json_objectagg',
  'bit_and',
  'bit_or',
  'stddev',
  'variance',
  'percentile_cont',
  'percentile_disc',
])
const NUMBER_FUNCTIONS = new Set([
  'count',
  'sum',
  'avg',
  'total',
  'abs',
  'round',
  'floor',
  'ceil',
  'ceiling',
  'random',
  'length',
  'char_length',
  'character_length',
  'octet_length',
  'instr',
  'position',
  'strpos',
  'row_number',
  'rank',
  'dense_rank',
  'ntile',
  'percent_rank',
  'cume_dist',
  'sign',
  'sqrt',
  'power',
  'pow',
  'exp',
  'ln',
  'log',
  'log10',
  'log2',
  'mod',
  'pi',
  'trunc',
  'truncate',
  'div',
  'width_bucket',
  'cardinality',
  'array_length',
  'json_array_length',
  'stddev',
  'variance',
  'extract',
  'date_part',
  'unixepoch',
  'julianday',
  'last_insert_rowid',
  'changes',
  'total_changes',
  'bit_length',
  'ascii',
  'unicode',
  'day',
  'month',
  'year',
  'hour',
  'minute',
  'second',
  'dayofweek',
  'dayofyear',
  'week',
  'quarter',
  'timestampdiff',
  'datediff',
  'found_rows',
  'row_count',
])
const STRING_FUNCTIONS = new Set([
  'lower',
  'upper',
  'trim',
  'ltrim',
  'rtrim',
  'btrim',
  'substr',
  'substring',
  'replace',
  'concat',
  'concat_ws',
  'group_concat',
  'string_agg',
  'format',
  'to_char',
  'lpad',
  'rpad',
  'left',
  'right',
  'reverse',
  'repeat',
  'initcap',
  'md5',
  'sha1',
  'sha2',
  'hex',
  'quote',
  'typeof',
  'printf',
  'strftime',
  'date',
  'time',
  'datetime',
  'timediff',
  'char',
  'chr',
  'translate',
  'regexp_replace',
  'split_part',
  'to_hex',
  'encode',
  'decode',
  'uuid',
  'gen_random_uuid',
  'json_extract',
  'json_quote',
  'json_type',
  'json_group_array',
  'json_group_object',
  'json',
  'json_object',
  'json_array',
  'json_build_object',
  'json_build_array',
  'to_json',
  'row_to_json',
  'json_agg',
  'jsonb_agg',
  'jsonb_build_object',
  'jsonb_build_array',
  'to_jsonb',
  'json_arrayagg',
  'json_objectagg',
  'json_unquote',
  'json_set',
  'json_insert',
  'json_replace',
  'json_remove',
  'json_patch',
  'array_to_string',
  'nullif',
  'current_user',
  'session_user',
  'version',
  'database',
  'schema',
  'user',
  'sqlite_version',
  'date_format',
  'time_format',
  'inet_ntoa',
  'soundex',
  'space',
  'elt',
  'field',
  'mid',
  'substring_index',
  'ucase',
  'lcase',
  'bin',
  'oct',
  'conv',
  'unhex',
  'compress',
  'uncompress',
  'aes_encrypt',
  'aes_decrypt',
  'to_base64',
  'from_base64',
  'convert',
  'group_concat_ws',
])
const BOOLEAN_FUNCTIONS = new Set([
  'bool_and',
  'bool_or',
  'every',
  'exists',
  'isnull',
  'is_valid_json',
  'json_valid',
  'starts_with',
  'jsonb_exists',
  'pg_is_in_recovery',
  'regexp_like',
  'like',
])
const DATE_FUNCTIONS = new Set([
  'now',
  'current_timestamp',
  'current_date',
  'current_time',
  'localtimestamp',
  'localtime',
  'date_trunc',
  'to_timestamp',
  'to_date',
  'make_date',
  'make_timestamp',
  'age',
  'curdate',
  'curtime',
  'sysdate',
  'utc_timestamp',
  'utc_date',
  'from_unixtime',
  'date_add',
  'date_sub',
  'adddate',
  'subdate',
  'str_to_date',
  'timestamp',
  'last_day',
  'makedate',
])

function dateType(
  ctx: Context,
  nullable: boolean | null,
  sources: readonly ColumnSource[],
): TypeInfo {
  const dataType =
    ctx.dialect === 'sqlite' ? 'TEXT' : ctx.dialect === 'mysql' ? 'datetime' : 'timestamp'
  return { dataType, tsType: toTsType(ctx.dialect, dataType), nullable, sources }
}

function isAggregateCall(expr: Expr): boolean {
  if (expr.type === 'call') return expr.over === null && AGGREGATES.has(expr.name.toLowerCase())
  return false
}

/** Whether an aggregate appears anywhere in the expression (outside subqueries). */
function hasAggregate(expr: Expr): boolean {
  if (isAggregateCall(expr)) return true
  return childExpressions(expr).some(hasAggregate)
}

function childExpressions(expr: Expr): readonly Expr[] {
  switch (expr.type) {
    case 'binary':
      return [expr.left, expr.right]
    case 'unary':
      return [expr.operand]
    case 'call':
      return [
        ...expr.args,
        ...(expr.over?.partitionBy ?? []),
        ...(expr.over?.orderBy.map((item) => item.expr) ?? []),
      ]
    case 'cast':
      return [expr.expr]
    case 'case':
      return [
        ...(expr.operand === null ? [] : [expr.operand]),
        ...expr.whens.flatMap((branch) => [branch.when, branch.result]),
        ...(expr.otherwise === null ? [] : [expr.otherwise]),
      ]
    case 'in':
      return [expr.expr, ...(expr.list ?? [])]
    case 'between':
      return [expr.expr, expr.low, expr.high]
    case 'like':
      return [expr.expr, expr.pattern]
    case 'is':
      return [expr.expr]
    case 'list':
      return expr.items
    case 'column':
    case 'star':
    case 'literal':
    case 'param':
    case 'exists':
    case 'subquery':
    case 'raw':
      return []
    default:
      return []
  }
}

/** The subqueries nested directly in an expression (not those inside deeper subqueries). */
function subqueriesOf(expr: Expr): readonly Query[] {
  switch (expr.type) {
    case 'exists':
      return [expr.query]
    case 'subquery':
      return [expr.query]
    case 'in':
      return [
        ...(expr.subquery === null ? [] : [expr.subquery]),
        ...(expr.expr.type === 'column' ? [] : subqueriesOf(expr.expr)),
        ...(expr.list ?? []).flatMap(subqueriesOf),
      ]
    case 'column':
    case 'star':
    case 'literal':
    case 'param':
    case 'binary':
    case 'unary':
    case 'call':
    case 'cast':
    case 'case':
    case 'between':
    case 'like':
    case 'is':
    case 'list':
    case 'raw':
      return childExpressions(expr).flatMap(subqueriesOf)
    default:
      return []
  }
}

type Typing = {
  readonly ctx: Context
  readonly scope: Scope
  readonly aliases: ReadonlyMap<string, TypeInfo> | null
  /** Where nested subqueries hang their output, when they are part of a clause node. */
  readonly lookups: Map<Query, string>
}

function typeOf(t: Typing, expr: Expr): TypeInfo {
  const { ctx } = t
  switch (expr.type) {
    case 'column':
      return resolveColumn(ctx, t.scope, expr.table, expr.name, expr.range, t.aliases)
    case 'star':
      return UNKNOWN
    case 'literal':
      if (expr.kind === 'null') {
        return { dataType: null, tsType: 'null', nullable: true, sources: [] }
      }
      return {
        dataType: literalDataType(ctx.dialect, expr.kind),
        tsType:
          expr.kind === 'boolean'
            ? toTsType(ctx.dialect, literalDataType(ctx.dialect, 'boolean'))
            : expr.kind,
        nullable: false,
        sources: [],
      }
    case 'param':
      return UNKNOWN
    case 'binary': {
      const left = typeOf(t, expr.left)
      const right = typeOf(t, expr.right)
      const sources = sourcesOf(left, right)
      const nullable = nullableOr(left, right)
      if (expr.op === 'AND' || expr.op === 'OR' || expr.op.startsWith('IS ')) {
        return booleanType(ctx, nullable, sources)
      }
      if (
        ['=', '<>', '!=', '<', '>', '<=', '>=', '<=>', '~', '!~', '~*', '!~*', '@>', '<@'].includes(
          expr.op,
        )
      ) {
        return booleanType(ctx, nullable, sources)
      }
      if (expr.op === '||') return stringType(ctx, nullable, sources)
      if (expr.op === '->' || expr.op === '#>') return { ...UNKNOWN, nullable: true, sources }
      if (expr.op === '->>' || expr.op === '#>>') return stringType(ctx, true, sources)
      if (expr.op === '[]') return { ...UNKNOWN, nullable: true, sources }
      if (['+', '-', '*', '/', '%', '^', '**'].includes(expr.op)) {
        // Date arithmetic keeps the date; everything else is a number.
        const dated = [left, right].find((side) => side.tsType === 'Date')
        return dated === undefined
          ? numberType(ctx, nullable, sources)
          : { ...dated, nullable, sources }
      }
      return { ...UNKNOWN, nullable, sources }
    }
    case 'unary': {
      const operand = typeOf(t, expr.operand)
      if (expr.op === 'NOT' || expr.op === '!') {
        return booleanType(ctx, operand.nullable, operand.sources)
      }
      return { ...operand, tsType: operand.tsType === 'unknown' ? 'number' : operand.tsType }
    }
    case 'call':
      return typeOfCall(t, expr)
    case 'cast': {
      const inner = typeOf(t, expr.expr)
      return {
        dataType: expr.to,
        tsType: toTsType(ctx.dialect, expr.to),
        nullable: inner.nullable,
        sources: inner.sources,
      }
    }
    case 'case': {
      const branches = expr.whens.map((branch) => typeOf(t, branch.result))
      const otherwise = expr.otherwise === null ? null : typeOf(t, expr.otherwise)
      const all = [...branches, ...(otherwise === null ? [] : [otherwise])]
      const typed =
        all.find((branch) => branch.tsType !== 'null' && branch.tsType !== 'unknown') ??
        all[0] ??
        UNKNOWN
      const conditions = [
        ...(expr.operand === null ? [] : [typeOf(t, expr.operand)]),
        ...expr.whens.map((branch) => typeOf(t, branch.when)),
      ]
      return {
        ...typed,
        nullable: otherwise === null ? true : nullableOr(...all),
        sources: sourcesOf(...all, ...conditions),
      }
    }
    case 'in': {
      const left = typeOf(t, expr.expr)
      const items = (expr.list ?? []).map((item) => typeOf(t, item))
      return booleanType(ctx, nullableOr(left, ...items), sourcesOf(left, ...items))
    }
    case 'between': {
      const parts = [typeOf(t, expr.expr), typeOf(t, expr.low), typeOf(t, expr.high)]
      return booleanType(ctx, nullableOr(...parts), sourcesOf(...parts))
    }
    case 'like': {
      const parts = [typeOf(t, expr.expr), typeOf(t, expr.pattern)]
      return booleanType(ctx, nullableOr(...parts), sourcesOf(...parts))
    }
    case 'is': {
      const inner = typeOf(t, expr.expr)
      return booleanType(ctx, false, inner.sources)
    }
    case 'exists':
      return booleanType(ctx, false, [])
    case 'subquery': {
      const built = buildQuery(ctx, expr.query, t.scope, 'subquery')
      const target = t.lookups.get(expr.query)
      if (target !== undefined) addEdge(ctx, built.nodeId, target, 'scalar', 'lookup')
      const first = built.columns[0]
      return first === undefined ? UNKNOWN : { ...first, nullable: true }
    }
    case 'list': {
      const items = expr.items.map((item) => typeOf(t, item))
      return { ...UNKNOWN, nullable: nullableOr(...items), sources: sourcesOf(...items) }
    }
    case 'raw':
      return UNKNOWN
    default:
      return UNKNOWN
  }
}

function typeOfCall(t: Typing, expr: Extract<Expr, { type: 'call' }>): TypeInfo {
  const { ctx } = t
  const name = expr.name.toLowerCase().split('.').at(-1) ?? ''
  const args = expr.args.filter((arg) => arg.type !== 'star').map((arg) => typeOf(t, arg))
  const sources = sourcesOf(...args)
  const argNullable = nullableOr(...args)
  if (name === 'count') return numberType(ctx, false, sources)
  if (
    name === 'coalesce' ||
    name === 'ifnull' ||
    name === 'nvl' ||
    (name === 'isnull' && args.length === 2)
  ) {
    const typed =
      args.find((arg) => arg.tsType !== 'null' && arg.tsType !== 'unknown') ?? args[0] ?? UNKNOWN
    const nullable =
      args.length === 0
        ? null
        : args.every((arg) => arg.nullable === true)
          ? true
          : args.some((arg) => arg.nullable === false)
            ? false
            : null
    return { ...typed, nullable, sources }
  }
  if (name === 'nullif') return { ...(args[0] ?? UNKNOWN), nullable: true, sources }
  if (name === 'iif' || name === 'if') {
    const [, then, otherwise] = args
    const typed =
      [then, otherwise].find(
        (arg) => arg !== undefined && arg.tsType !== 'null' && arg.tsType !== 'unknown',
      ) ??
      then ??
      UNKNOWN
    return {
      ...typed,
      nullable: nullableOr(...[then, otherwise].filter((arg) => arg !== undefined)),
      sources,
    }
  }
  if (
    name === 'min' ||
    name === 'max' ||
    name === 'first_value' ||
    name === 'last_value' ||
    name === 'lag' ||
    name === 'lead' ||
    name === 'nth_value' ||
    name === 'any_value'
  ) {
    const first = args[0] ?? UNKNOWN
    return {
      ...first,
      nullable: expr.over === null || name === 'lag' || name === 'lead' ? true : first.nullable,
      sources,
    }
  }
  if (name === 'sum' || name === 'avg' || name === 'stddev' || name === 'variance') {
    const first = args[0] ?? UNKNOWN
    const kept =
      first.tsType === 'string' && ctx.dialect !== 'sqlite' ? first : numberType(ctx, true, sources)
    return { ...kept, nullable: true, sources }
  }
  if (name === 'row_number' || name === 'rank' || name === 'dense_rank' || name === 'ntile') {
    return numberType(ctx, false, sources)
  }
  if (name === 'array_agg' || name === 'array') {
    const first = args[0] ?? UNKNOWN
    return {
      dataType: first.dataType === null ? null : `${first.dataType}[]`,
      tsType: `${first.tsType === 'unknown' ? 'unknown' : first.tsType}[]`,
      nullable: name === 'array_agg',
      sources,
    }
  }
  if (
    name === 'json_agg' ||
    name === 'jsonb_agg' ||
    name === 'json_object' ||
    name === 'json_build_object' ||
    name === 'jsonb_build_object' ||
    name === 'to_json' ||
    name === 'to_jsonb' ||
    name === 'row_to_json' ||
    name === 'json_extract' ||
    name === 'json'
  ) {
    const dataType = ctx.dialect === 'sqlite' ? 'TEXT' : ctx.dialect === 'mysql' ? 'json' : 'jsonb'
    return {
      dataType,
      tsType: ctx.dialect === 'sqlite' ? 'string' : 'unknown',
      nullable: argNullable,
      sources,
    }
  }
  if (NUMBER_FUNCTIONS.has(name)) return numberType(ctx, argNullable, sources)
  if (BOOLEAN_FUNCTIONS.has(name)) return booleanType(ctx, argNullable, sources)
  if (DATE_FUNCTIONS.has(name)) {
    return dateType(ctx, args.length === 0 ? false : argNullable, sources)
  }
  if (STRING_FUNCTIONS.has(name)) {
    return stringType(ctx, args.length === 0 ? false : argNullable, sources)
  }
  return { ...UNKNOWN, nullable: argNullable, sources }
}

// --- parameters -------------------------------------------------------------------------------------

/** Records every placeholder with the type of what it stands beside. */
function collectParams(t: Typing, expr: Expr, expected: TypeInfo | null, context: string) {
  const { ctx } = t
  const quietTyping: Typing = {
    ...t,
    ctx: { ...ctx, diagnostics: [], nodes: [], edges: [], refs: [] },
  }
  const typeQuietly = (candidate: Expr): TypeInfo | null =>
    candidate.type === 'param' || candidate.type === 'subquery' || candidate.type === 'exists'
      ? null
      : typeOf(quietTyping, candidate)
  switch (expr.type) {
    case 'param':
      ctx.params.push({
        placeholder: expr.placeholder,
        type: expected ?? UNKNOWN,
        context,
        range: expr.range,
      })
      return
    case 'binary': {
      const comparison = ['=', '<>', '!=', '<', '>', '<=', '>=', '<=>'].includes(expr.op)
      const arithmetic = ['+', '-', '*', '/', '%', '^', '**'].includes(expr.op)
      const leftType =
        expr.right.type === 'param' || expr.left.type === 'param' ? typeQuietly(expr.left) : null
      const rightType =
        expr.left.type === 'param' || expr.right.type === 'param' ? typeQuietly(expr.right) : null
      const text = snippet(ctx, expr.range)
      const sideType = (other: TypeInfo | null): TypeInfo | null => {
        if (comparison) {
          return other === null
            ? null
            : withNullable(other, expr.op === '<=>' ? other.nullable : false)
        }
        if (arithmetic) {
          return other === null || other.tsType === 'unknown' ? numberType(ctx, false, []) : other
        }
        if (expr.op === '||') return stringType(ctx, false, [])
        return other
      }
      collectParams(t, expr.left, sideType(rightType), text)
      collectParams(t, expr.right, sideType(leftType), text)
      return
    }
    case 'in': {
      const left = expr.expr.type === 'param' ? null : typeQuietly(expr.expr)
      const text = snippet(ctx, expr.range)
      collectParams(t, expr.expr, null, text)
      for (const item of expr.list ?? []) {
        collectParams(t, item, left === null ? null : withNullable(left, false), text)
      }
      return
    }
    case 'between': {
      const left = typeQuietly(expr.expr)
      const text = snippet(ctx, expr.range)
      collectParams(t, expr.expr, null, text)
      collectParams(t, expr.low, left === null ? null : withNullable(left, false), text)
      collectParams(t, expr.high, left === null ? null : withNullable(left, false), text)
      return
    }
    case 'like': {
      const text = snippet(ctx, expr.range)
      collectParams(t, expr.expr, stringType(ctx, false, []), text)
      collectParams(t, expr.pattern, stringType(ctx, false, []), text)
      return
    }
    case 'call': {
      const text = snippet(ctx, expr.range)
      for (const arg of expr.args) collectParams(t, arg, null, text)
      return
    }
    case 'cast':
      collectParams(
        t,
        expr.expr,
        { dataType: expr.to, tsType: toTsType(ctx.dialect, expr.to), nullable: false, sources: [] },
        snippet(ctx, expr.range),
      )
      return
    case 'case': {
      const text = snippet(ctx, expr.range, 60)
      const operand = expr.operand === null ? null : typeQuietly(expr.operand)
      if (expr.operand !== null) collectParams(t, expr.operand, null, text)
      for (const branch of expr.whens) {
        collectParams(
          t,
          branch.when,
          operand === null ? booleanType(ctx, false, []) : withNullable(operand, false),
          text,
        )
        collectParams(t, branch.result, null, text)
      }
      if (expr.otherwise !== null) collectParams(t, expr.otherwise, null, text)
      return
    }
    case 'unary':
      collectParams(
        t,
        expr.operand,
        expr.op === 'NOT' ? booleanType(ctx, false, []) : numberType(ctx, false, []),
        snippet(ctx, expr.range),
      )
      return
    case 'is':
      collectParams(t, expr.expr, null, snippet(ctx, expr.range))
      return
    case 'list':
      for (const item of expr.items) collectParams(t, item, null, context)
      break
    case 'column':
    case 'star':
    case 'literal':
    case 'exists':
    case 'subquery':
    case 'raw':
      break
    default:
      break
  }
}

// --- FROM ---------------------------------------------------------------------------------------------

type FromResult = { readonly nodeId: string; readonly relations: readonly Relation[] }

function lookupTable(ctx: Context, name: TableName) {
  return ctx.tables.get(name.name.toLowerCase()) ?? null
}

function tableRelation(
  ctx: Context,
  item: Extract<FromItem, { type: 'table' }>,
  scope: Scope,
  scopeName: string,
): FromResult {
  const cte = scope.ctes.get(item.table.name.toLowerCase()) ?? findCte(scope.outer, item.table.name)
  const alias = item.alias ?? item.table.name
  if (cte !== null && cte !== undefined && item.table.schema === null) {
    const relation: Relation = {
      key: alias.toLowerCase(),
      display: alias,
      nodeId: cte.nodeId,
      columns: cte.columns,
      known: cte.columns.length > 0,
      tableName: null,
      outerNullable: false,
      used: new Set(),
    }
    return { nodeId: cte.nodeId, relations: [relation] }
  }
  const table = lookupTable(ctx, item.table)
  const known = table !== null
  const display =
    item.table.schema === null ? item.table.name : `${item.table.schema}.${item.table.name}`
  if (!known) {
    warn(
      ctx,
      `Unknown table "${display}"`,
      item.table.range,
      ctx.tables.size === 0 ? 'info' : 'warning',
    )
  }
  const columns: Resolved[] = (table?.columns ?? []).map((column) => ({
    dataType: column.dataType,
    tsType: toTsType(ctx.dialect, column.dataType),
    nullable: column.nullable,
    name: column.name,
    expression: column.name,
    sources: [{ table: table?.name ?? item.table.name, column: column.name }],
  }))
  const nodeId = addNode(ctx, {
    kind: 'table',
    label: item.alias === null ? display : `${display} AS ${item.alias}`,
    details: known ? [] : ['not in the schema'],
    range: item.range,
    scope: scopeName,
    columns: columns.map((column) => ({
      name: column.name,
      dataType: column.dataType,
      used: false,
    })),
  })
  const used = new Set<string>()
  ctx.refs.push({
    nodeId,
    name: table?.name ?? item.table.name,
    alias: item.alias,
    scope: scopeName,
    known,
    range: item.table.range,
    used,
    schemaColumns: table?.columns ?? [],
  })
  const relation: Relation = {
    key: alias.toLowerCase(),
    display: alias,
    nodeId,
    columns,
    known,
    tableName: table?.name ?? item.table.name,
    outerNullable: false,
    used,
  }
  return { nodeId, relations: [relation] }
}

function findCte(
  scope: Scope | null,
  name: string,
): { readonly nodeId: string; readonly columns: readonly Resolved[] } | null {
  if (scope === null) return null
  return scope.ctes.get(name.toLowerCase()) ?? findCte(scope.outer, name)
}

function buildFromItem(ctx: Context, item: FromItem, scope: Scope, scopeName: string): FromResult {
  switch (item.type) {
    case 'table':
      return tableRelation(ctx, item, scope, scopeName)
    case 'subquery': {
      const alias = item.alias ?? 'subquery'
      const built = buildQuery(
        ctx,
        item.query,
        item.lateral ? scope : { relations: [], outer: scope, ctes: new Map() },
        alias,
      )
      const nodeId = addNode(ctx, {
        kind: 'subquery',
        label: alias,
        details: [],
        range: item.range,
        scope: scopeName,
        columns: built.columns.map((column) => ({
          name: column.name,
          dataType: column.dataType,
          used: false,
        })),
      })
      addEdge(ctx, built.nodeId, nodeId)
      const relation: Relation = {
        key: alias.toLowerCase(),
        display: alias,
        nodeId,
        columns: built.columns,
        known: built.known,
        tableName: null,
        outerNullable: false,
        used: new Set(),
      }
      return { nodeId, relations: [relation] }
    }
    case 'function': {
      const alias = item.alias ?? (item.call.type === 'call' ? item.call.name : 'function')
      const nodeId = addNode(ctx, {
        kind: 'function',
        label: snippet(ctx, item.call.range, 60),
        details: [],
        range: item.range,
        scope: scopeName,
        columns: [],
      })
      const relation: Relation = {
        key: alias.toLowerCase(),
        display: alias,
        nodeId,
        columns: [],
        known: false,
        tableName: null,
        outerNullable: false,
        used: new Set(),
      }
      return { nodeId, relations: [relation] }
    }
    case 'join': {
      const left = buildFromItem(ctx, item.left, scope, scopeName)
      const right = buildFromItem(
        ctx,
        item.right,
        { relations: left.relations, outer: scope, ctes: new Map() },
        scopeName,
      )
      const leftRelations =
        item.joinType === 'RIGHT' || item.joinType === 'FULL'
          ? left.relations.map((relation) => ({ ...relation, outerNullable: true }))
          : left.relations
      const rightRelations =
        item.joinType === 'LEFT' || item.joinType === 'FULL'
          ? right.relations.map((relation) => ({ ...relation, outerNullable: true }))
          : right.relations
      const relations = [...leftRelations, ...rightRelations]
      const joinScope: Scope = { relations, outer: scope, ctes: new Map() }
      const typing: Typing = { ctx, scope: joinScope, aliases: null, lookups: new Map() }
      const label = `${item.natural ? 'NATURAL ' : ''}${item.joinType} JOIN`
      const details =
        item.on !== null
          ? [`ON ${snippet(ctx, item.on.range)}`]
          : item.using !== null
            ? [`USING (${item.using.join(', ')})`]
            : []
      if (item.on !== null) {
        typeOf(typing, item.on)
        collectParams(typing, item.on, null, snippet(ctx, item.on.range))
      }
      for (const name of item.using ?? []) {
        for (const relation of [...left.relations, ...right.relations]) relation.used.add(name)
      }
      const nodeId = addNode(ctx, {
        kind: 'join',
        label,
        details,
        range: item.on?.range ?? item.range,
        scope: scopeName,
        columns: [],
      })
      addEdge(ctx, left.nodeId, nodeId, item.joinType === 'RIGHT' ? 'optional' : null)
      addEdge(ctx, right.nodeId, nodeId, item.joinType === 'LEFT' ? 'optional' : null)
      return { nodeId, relations }
    }
    default:
      return { nodeId: '', relations: [] }
  }
}

function buildFrom(
  ctx: Context,
  items: readonly FromItem[],
  scope: Scope,
  scopeName: string,
): FromResult | null {
  const first = items[0]
  if (first === undefined) return null
  const results = items.map((item) => buildFromItem(ctx, item, scope, scopeName))
  const relations = results.flatMap((result) => result.relations)
  if (results.length === 1) return { nodeId: results[0]?.nodeId ?? '', relations }
  const nodeId = addNode(ctx, {
    kind: 'join',
    label: 'CROSS JOIN',
    details: [`${results.length} sources listed in FROM`],
    range: null,
    scope: scopeName,
    columns: [],
  })
  for (const result of results) addEdge(ctx, result.nodeId, nodeId)
  return { nodeId, relations }
}

// --- SELECT --------------------------------------------------------------------------------------------

type Built = {
  readonly nodeId: string
  readonly columns: readonly Resolved[]
  readonly known: boolean
}

/** The name a driver gives an unaliased select item. */
function outputName(ctx: Context, item: SelectItem): string {
  if (item.alias !== null) return item.alias
  const { expr } = item
  if (expr.type === 'column') return expr.name
  if (ctx.dialect === 'postgresql') {
    if (expr.type === 'call') return expr.name.toLowerCase().split('.').at(-1) ?? 'column'
    if (expr.type === 'cast') {
      return (
        expr.to
          .toLowerCase()
          .replace(/\(.*\)/u, '')
          .split(' ')[0] ?? 'column'
      )
    }
    if (expr.type === 'case') return 'case'
    if (expr.type === 'literal' && expr.kind === 'boolean') return 'bool'
    return '?column?'
  }
  return snippet(ctx, expr.range, 200)
}

function expandStar(
  ctx: Context,
  scope: Scope,
  expr: Extract<Expr, { type: 'star' }>,
): { readonly columns: readonly Resolved[]; readonly known: boolean } {
  const relations =
    expr.table === null
      ? scope.relations
      : [findRelation(scope, expr.table)].filter((relation) => relation !== null)
  if (expr.table !== null && relations.length === 0) {
    warn(ctx, `"${expr.table}" is not a table or alias in scope`, expr.range)
    return { columns: [], known: false }
  }
  const columns = relations.flatMap((relation) =>
    relation.columns.map((column) => {
      relation.used.add(column.name)
      return { ...column, nullable: relation.outerNullable ? true : column.nullable }
    }),
  )
  return { columns, known: relations.every((relation) => relation.known) }
}

/** The nodes in a query after the projection — DISTINCT, ORDER BY, LIMIT — are shared by SELECT and set operations. */
function buildTail(
  ctx: Context,
  query: Query,
  from: Built,
  scope: Scope,
  scopeName: string,
  aliases: ReadonlyMap<string, TypeInfo>,
): Built {
  const orderNode = (previous: string): string => {
    if (query.orderBy.length === 0) return previous
    const typing: Typing = { ctx, scope, aliases, lookups: new Map() }
    for (const item of query.orderBy) {
      typeOf(typing, item.expr)
      collectParams(typing, item.expr, null, snippet(ctx, item.range))
    }
    const range = orderRange(query.orderBy)
    const nodeId = addNode(ctx, {
      kind: 'sort',
      label: 'ORDER BY',
      details: query.orderBy.map(
        (item) =>
          `${snippet(ctx, item.expr.range, 60)}${item.direction === null ? '' : ` ${item.direction}`}`,
      ),
      range,
      scope: scopeName,
      columns: [],
    })
    addEdge(ctx, previous, nodeId)
    return nodeId
  }
  const limitNode = (previous: string): string => {
    if (query.limit === null && query.offset === null) return previous
    const typing: Typing = { ctx, scope, aliases, lookups: new Map() }
    const details = [
      ...(query.limit === null ? [] : [`LIMIT ${snippet(ctx, query.limit.range)}`]),
      ...(query.offset === null ? [] : [`OFFSET ${snippet(ctx, query.offset.range)}`]),
    ]
    if (query.limit !== null) {
      collectParams(
        typing,
        query.limit,
        numberType(ctx, false, []),
        `LIMIT ${snippet(ctx, query.limit.range)}`,
      )
    }
    if (query.offset !== null) {
      collectParams(
        typing,
        query.offset,
        numberType(ctx, false, []),
        `OFFSET ${snippet(ctx, query.offset.range)}`,
      )
    }
    const range = query.limit?.range ?? query.offset?.range ?? null
    const nodeId = addNode(ctx, {
      kind: 'limit',
      label: query.limit === null ? 'OFFSET' : 'LIMIT',
      details,
      range,
      scope: scopeName,
      columns: [],
    })
    addEdge(ctx, previous, nodeId)
    return nodeId
  }
  return { ...from, nodeId: limitNode(orderNode(from.nodeId)) }
}

function orderRange(items: readonly OrderItem[]): Range | null {
  const first = items[0]
  const last = items.at(-1)
  return first === undefined || last === undefined
    ? null
    : { start: first.range.start, end: last.range.end }
}

function selectRange(items: readonly SelectItem[]): Range | null {
  const first = items[0]
  const last = items.at(-1)
  return first === undefined || last === undefined
    ? null
    : { start: first.range.start, end: last.range.end }
}

function buildSelect(
  ctx: Context,
  core: SelectCore,
  outer: Scope,
  scopeName: string,
): {
  readonly built: Built
  readonly scope: Scope
  readonly aliases: ReadonlyMap<string, TypeInfo>
} {
  const from = buildFrom(ctx, core.from, outer, scopeName)
  const scope: Scope = {
    relations: from?.relations ?? [],
    outer: outer.outer === null && outer.relations.length === 0 ? outer.outer : outer,
    ctes: outer.ctes,
  }
  const chain = { current: from?.nodeId ?? null }
  const link = (nodeId: string) => {
    if (chain.current !== null) addEdge(ctx, chain.current, nodeId)
    chain.current = nodeId
  }

  if (core.where !== null) {
    const nodeId = nextIdReserved(ctx)
    const typing: Typing = {
      ctx,
      scope,
      aliases: null,
      lookups: new Map(subqueriesOf(core.where).map((query) => [query, nodeId])),
    }
    const condition = typeOf(typing, core.where)
    collectParams(typing, core.where, null, snippet(ctx, core.where.range))
    ctx.nodes.push({
      id: nodeId,
      kind: 'filter',
      label: 'WHERE',
      details: [snippet(ctx, core.where.range)],
      range: core.where.range,
      scope: scopeName,
      columns: [],
    })
    if (
      condition.tsType !== 'unknown' &&
      condition.tsType !== 'boolean' &&
      condition.tsType !== 'number' &&
      ctx.dialect === 'postgresql'
    ) {
      warn(ctx, `WHERE expects a boolean, this condition is ${condition.tsType}`, core.where.range)
    }
    link(nodeId)
  }

  const aggregated =
    core.groupBy.length > 0 ||
    core.having !== null ||
    core.columns.some((item) => hasAggregate(item.expr))
  if (aggregated) {
    const typing: Typing = { ctx, scope, aliases: null, lookups: new Map() }
    for (const key of core.groupBy) {
      typeOf(typing, key)
      collectParams(typing, key, null, snippet(ctx, key.range))
    }
    const aggregates = core.columns
      .flatMap((item) => aggregateCalls(item.expr))
      .map((call) => snippet(ctx, call.range, 60))
    const details = [
      ...(core.groupBy.length === 0
        ? ['whole result as one group']
        : [`BY ${core.groupBy.map((key) => snippet(ctx, key.range, 60)).join(', ')}`]),
      ...aggregates,
    ]
    const range =
      core.groupBy.length === 0
        ? null
        : { start: core.groupBy[0]?.range.start ?? 0, end: core.groupBy.at(-1)?.range.end ?? 0 }
    const nodeId = addNode(ctx, {
      kind: 'aggregate',
      label: 'GROUP BY',
      details,
      range,
      scope: scopeName,
      columns: [],
    })
    link(nodeId)
  }

  // Select aliases are visible to ORDER BY (and, in SQLite / MySQL, to HAVING); they are typed
  // before HAVING so that both can read them.
  const projectId = nextIdReserved(ctx)
  const lookups = new Map(
    core.columns.flatMap((item) =>
      subqueriesOf(item.expr).map((query) => [query, projectId] as const),
    ),
  )
  const typing: Typing = { ctx, scope, aliases: null, lookups }
  const expanded = core.columns.flatMap(
    (item): { readonly resolved: Resolved; readonly known: boolean }[] => {
      if (item.expr.type === 'star') {
        const star = expandStar(ctx, scope, item.expr)
        return star.columns.map((column) => ({ resolved: column, known: star.known }))
      }
      const type = typeOf(typing, item.expr)
      collectParams(typing, item.expr, null, snippet(ctx, item.range, 60))
      return [
        {
          resolved: {
            ...type,
            name: outputName(ctx, item),
            expression: snippet(ctx, item.expr.range, 200),
          },
          known: true,
        },
      ]
    },
  )
  const columns = expanded.map((entry) => entry.resolved)
  const aliases = new Map(
    core.columns.flatMap((item, index) =>
      item.alias === null ? [] : [[item.alias.toLowerCase(), columns[index] ?? UNKNOWN] as const],
    ),
  )

  if (core.having !== null) {
    const havingId = nextIdReserved(ctx)
    const havingTyping: Typing = {
      ctx,
      scope,
      aliases,
      lookups: new Map(subqueriesOf(core.having).map((query) => [query, havingId])),
    }
    typeOf(havingTyping, core.having)
    collectParams(havingTyping, core.having, null, snippet(ctx, core.having.range))
    ctx.nodes.push({
      id: havingId,
      kind: 'having',
      label: 'HAVING',
      details: [snippet(ctx, core.having.range)],
      range: core.having.range,
      scope: scopeName,
      columns: [],
    })
    link(havingId)
  }

  ctx.nodes.push({
    id: projectId,
    kind: 'project',
    label: core.distinct ? 'SELECT DISTINCT' : 'SELECT',
    details:
      columns.length > 12
        ? [...columns.slice(0, 12).map((column) => column.name), `… ${columns.length - 12} more`]
        : columns.map((column) => column.name),
    range: selectRange(core.columns),
    scope: scopeName,
    columns: columns.map((column) => ({
      name: column.name,
      dataType: column.dataType,
      used: true,
    })),
  })
  link(projectId)
  return {
    built: { nodeId: projectId, columns, known: expanded.every((entry) => entry.known) },
    scope,
    aliases,
  }
}

/** Reserves an id for a node that is added after the expressions it holds have been typed (so lookups can point at it). */
function nextIdReserved(ctx: Context) {
  return nextId(ctx)
}

function aggregateCalls(expr: Expr): readonly Extract<Expr, { type: 'call' }>[] {
  if (expr.type === 'call' && isAggregateCall(expr)) return [expr]
  return childExpressions(expr).flatMap(aggregateCalls)
}

function buildBody(
  ctx: Context,
  body: QueryBody,
  scope: Scope,
  scopeName: string,
): {
  readonly built: Built
  readonly scope: Scope
  readonly aliases: ReadonlyMap<string, TypeInfo>
} {
  switch (body.type) {
    case 'select':
      return buildSelect(ctx, body, scope, scopeName)
    case 'setop': {
      const left = buildBody(ctx, body.left, scope, scopeName)
      const right = buildBody(ctx, body.right, scope, scopeName)
      const columns = left.built.columns.map((column, index) => {
        const other = right.built.columns[index]
        return other === undefined
          ? column
          : { ...column, nullable: nullableOr(column, other), sources: sourcesOf(column, other) }
      })
      if (
        left.built.known &&
        right.built.known &&
        left.built.columns.length !== right.built.columns.length
      ) {
        warn(
          ctx,
          `${body.op}: the left side has ${left.built.columns.length} columns, the right side ${right.built.columns.length}`,
          body.range,
        )
      }
      const nodeId = addNode(ctx, {
        kind: 'union',
        label: `${body.op}${body.all ? ' ALL' : ''}`,
        details: [],
        range: null,
        scope: scopeName,
        columns: columns.map((column) => ({
          name: column.name,
          dataType: column.dataType,
          used: true,
        })),
      })
      addEdge(ctx, left.built.nodeId, nodeId)
      addEdge(ctx, right.built.nodeId, nodeId)
      return {
        built: { nodeId, columns, known: left.built.known && right.built.known },
        scope: left.scope,
        aliases: left.aliases,
      }
    }
    case 'values': {
      const typing: Typing = { ctx, scope, aliases: null, lookups: new Map() }
      const first = body.rows[0] ?? []
      const columns: Resolved[] = first.map((expr, index) => {
        const types = body.rows
          .map((row) => row[index])
          .filter((cell) => cell !== undefined)
          .map((cell) => typeOf(typing, cell))
        const typed =
          types.find((type) => type.tsType !== 'null' && type.tsType !== 'unknown') ??
          types[0] ??
          UNKNOWN
        return {
          dataType: typed.dataType,
          tsType: typed.tsType,
          sources: typed.sources,
          nullable: nullableOr(...types),
          name: `column${index + 1}`,
          expression: snippet(ctx, expr.range, 60),
        }
      })
      for (const row of body.rows) {
        for (const cell of row) collectParams(typing, cell, null, 'VALUES')
      }
      const nodeId = addNode(ctx, {
        kind: 'values',
        label: 'VALUES',
        details: [`${body.rows.length} ${body.rows.length === 1 ? 'row' : 'rows'}`],
        range: body.range,
        scope: scopeName,
        columns: columns.map((column) => ({
          name: column.name,
          dataType: column.dataType,
          used: true,
        })),
      })
      return { built: { nodeId, columns, known: true }, scope, aliases: new Map() }
    }
    default:
      return { built: { nodeId: '', columns: [], known: false }, scope, aliases: new Map() }
  }
}

function buildCtes(ctx: Context, ctes: readonly Cte[], recursive: boolean, scope: Scope): Scope {
  const registered = new Map(scope.ctes)
  for (const cte of ctes) {
    const scopeName = cte.name
    const inner: Scope = { relations: [], outer: scope.outer, ctes: registered }
    if (recursive) {
      // The anchor's columns are unknown until the CTE is built; a self-reference reads an open relation.
      registered.set(cte.name.toLowerCase(), { nodeId: '', columns: [] })
    }
    const placeholder = recursive ? nextIdReserved(ctx) : null
    if (placeholder !== null) {
      registered.set(cte.name.toLowerCase(), { nodeId: placeholder, columns: [] })
    }
    const built = buildQuery(ctx, cte.query, inner, scopeName)
    const columns =
      cte.columns === null
        ? built.columns
        : built.columns.map((column, index) => ({
            ...column,
            name: cte.columns?.[index] ?? column.name,
          }))
    const node = {
      kind: 'cte' as const,
      label: `WITH ${cte.name}`,
      details: [],
      range: cte.range,
      scope: scopeName,
      columns: columns.map((column) => ({
        name: column.name,
        dataType: column.dataType,
        used: false,
      })),
    }
    const nodeId = placeholder ?? addNode(ctx, node)
    if (placeholder !== null) ctx.nodes.push({ id: placeholder, ...node })
    addEdge(ctx, built.nodeId, nodeId)
    registered.set(cte.name.toLowerCase(), { nodeId, columns })
  }
  return { ...scope, ctes: registered }
}

/** A whole query: its CTEs, its body and the sort / limit tail; returns the node the result comes out of. */
function buildQuery(ctx: Context, query: Query, scope: Scope, scopeName: string): Built {
  const withCtes =
    query.ctes.length === 0 ? scope : buildCtes(ctx, query.ctes, query.recursive, scope)
  const { built, scope: bodyScope, aliases } = buildBody(ctx, query.body, withCtes, scopeName)
  return buildTail(ctx, query, built, bodyScope, scopeName, aliases)
}

// --- DML ---------------------------------------------------------------------------------------------------

function targetRelation(
  ctx: Context,
  table: TableName,
  alias: string | null,
  range: Range,
  scope: Scope,
  scopeName: string,
) {
  return tableRelation(ctx, { type: 'table', table, alias, range }, scope, scopeName)
}

function buildReturning(
  ctx: Context,
  items: readonly SelectItem[] | null,
  previous: string,
  scope: Scope,
  scopeName: string,
): readonly Resolved[] {
  if (items === null) return []
  const nodeId = nextIdReserved(ctx)
  const typing: Typing = { ctx, scope, aliases: null, lookups: new Map() }
  const columns = items.flatMap((item): Resolved[] => {
    if (item.expr.type === 'star') return [...expandStar(ctx, scope, item.expr).columns]
    const type = typeOf(typing, item.expr)
    return [
      { ...type, name: outputName(ctx, item), expression: snippet(ctx, item.expr.range, 200) },
    ]
  })
  ctx.nodes.push({
    id: nodeId,
    kind: 'returning',
    label: 'RETURNING',
    details: columns.map((column) => column.name),
    range: selectRange(items),
    scope: scopeName,
    columns: columns.map((column) => ({
      name: column.name,
      dataType: column.dataType,
      used: true,
    })),
  })
  addEdge(ctx, previous, nodeId)
  return columns
}

function buildInsert(
  ctx: Context,
  statement: Extract<Statement, { type: 'insert' }>,
): readonly Resolved[] {
  const root: Scope = { relations: [], outer: null, ctes: new Map() }
  const scope = statement.ctes.length === 0 ? root : buildCtes(ctx, statement.ctes, false, root)
  const table = lookupTable(ctx, statement.table)
  const targetColumns: readonly SchemaColumn[] =
    statement.columns === null
      ? (table?.columns ?? [])
      : statement.columns.map(
          (name) =>
            table?.columns.find((column) => column.name.toLowerCase() === name.toLowerCase()) ?? {
              name,
              dataType: '',
              nullable: true,
            },
        )
  if (table !== null && statement.columns !== null) {
    for (const name of statement.columns) {
      if (!table.columns.some((column) => column.name.toLowerCase() === name.toLowerCase())) {
        warn(ctx, `"${table.name}" has no column "${name}"`, statement.range)
      }
    }
  }
  const expectedTypes = targetColumns.map((column) =>
    column.dataType === '' ? null : typeOfColumn(ctx, column),
  )
  const insertScope: Scope = { relations: [], outer: null, ctes: scope.ctes }
  const typing: Typing = { ctx, scope: insertScope, aliases: null, lookups: new Map() }
  const sourceId = (() => {
    if (statement.source.type === 'values') {
      for (const row of statement.source.rows) {
        if (table !== null && row.length !== targetColumns.length && targetColumns.length > 0) {
          warn(
            ctx,
            `${row.length} values for ${targetColumns.length} columns`,
            statement.source.range,
          )
        }
        for (const [index, cell] of row.entries()) {
          const column = targetColumns[index]
          collectParams(
            typing,
            cell,
            expectedTypes[index] ?? null,
            column === undefined ? 'VALUES' : `${statement.table.name}.${column.name}`,
          )
        }
      }
      return addNode(ctx, {
        kind: 'values',
        label: 'VALUES',
        details: [
          `${statement.source.rows.length} ${statement.source.rows.length === 1 ? 'row' : 'rows'}`,
        ],
        range: statement.source.range,
        scope: 'main',
        columns: targetColumns.map((column) => ({
          name: column.name,
          dataType: column.dataType === '' ? null : column.dataType,
          used: true,
        })),
      })
    }
    if (statement.source.type === 'query') {
      const built = buildQuery(ctx, statement.source.query, insertScope, 'main')
      if (
        table !== null &&
        built.known &&
        built.columns.length !== targetColumns.length &&
        targetColumns.length > 0
      ) {
        warn(
          ctx,
          `The query yields ${built.columns.length} columns for ${targetColumns.length} target columns`,
          statement.source.range,
        )
      }
      return built.nodeId
    }
    return addNode(ctx, {
      kind: 'values',
      label: 'DEFAULT VALUES',
      details: [],
      range: statement.source.range,
      scope: 'main',
      columns: [],
    })
  })()
  const target = targetRelation(
    ctx,
    statement.table,
    statement.alias,
    statement.table.range,
    scope,
    'main',
  )
  const insertId = addNode(ctx, {
    kind: 'insert',
    label: `INSERT INTO ${statement.table.name}`,
    details: [
      ...(statement.columns === null ? [] : [`(${statement.columns.join(', ')})`]),
      ...(statement.onConflict === null ? [] : [snippet(ctx, statement.onConflict, 80)]),
    ],
    range: statement.range,
    scope: 'main',
    columns: [],
  })
  addEdge(ctx, sourceId, insertId)
  addEdge(ctx, target.nodeId, insertId, 'target')
  for (const column of targetColumns) {
    for (const relation of target.relations) relation.used.add(column.name)
  }
  return buildReturning(
    ctx,
    statement.returning,
    insertId,
    { relations: target.relations, outer: null, ctes: scope.ctes },
    'main',
  )
}

function buildUpdate(
  ctx: Context,
  statement: Extract<Statement, { type: 'update' }>,
): readonly Resolved[] {
  const root: Scope = { relations: [], outer: null, ctes: new Map() }
  const scope = statement.ctes.length === 0 ? root : buildCtes(ctx, statement.ctes, false, root)
  const target = targetRelation(
    ctx,
    statement.table,
    statement.alias,
    statement.table.range,
    scope,
    'main',
  )
  const from = buildFrom(
    ctx,
    statement.from,
    { relations: target.relations, outer: null, ctes: scope.ctes },
    'main',
  )
  const relations = [...target.relations, ...(from?.relations ?? [])]
  const rowScope: Scope = { relations, outer: null, ctes: scope.ctes }
  const chain = { current: target.nodeId }
  if (from !== null) {
    const joinId = addNode(ctx, {
      kind: 'join',
      label: 'JOIN',
      details: ['FROM'],
      range: null,
      scope: 'main',
      columns: [],
    })
    addEdge(ctx, target.nodeId, joinId)
    addEdge(ctx, from.nodeId, joinId)
    chain.current = joinId
  }
  if (statement.where !== null) {
    const nodeId = nextIdReserved(ctx)
    const typing: Typing = {
      ctx,
      scope: rowScope,
      aliases: null,
      lookups: new Map(subqueriesOf(statement.where).map((query) => [query, nodeId])),
    }
    typeOf(typing, statement.where)
    collectParams(typing, statement.where, null, snippet(ctx, statement.where.range))
    ctx.nodes.push({
      id: nodeId,
      kind: 'filter',
      label: 'WHERE',
      details: [snippet(ctx, statement.where.range)],
      range: statement.where.range,
      scope: 'main',
      columns: [],
    })
    addEdge(ctx, chain.current, nodeId)
    chain.current = nodeId
  } else {
    warn(ctx, 'UPDATE without WHERE changes every row', statement.range)
  }
  const updateId = nextIdReserved(ctx)
  const typing: Typing = {
    ctx,
    scope: rowScope,
    aliases: null,
    lookups: new Map(
      statement.set.flatMap((item) =>
        subqueriesOf(item.value).map((query) => [query, updateId] as const),
      ),
    ),
  }
  const targetTable = target.relations[0]
  for (const item of statement.set) {
    const column = targetTable === undefined ? null : columnOf(targetTable, item.column)
    if (targetTable?.known && column === null) {
      warn(ctx, `"${targetTable.display}" has no column "${item.column}"`, item.range)
    }
    targetTable?.used.add(item.column)
    if (item.value.type !== 'raw') {
      typeOf(typing, item.value)
      collectParams(
        typing,
        item.value,
        column === null ? null : { ...column, sources: [] },
        `SET ${snippet(ctx, item.range, 60)}`,
      )
    }
  }
  ctx.nodes.push({
    id: updateId,
    kind: 'update',
    label: `UPDATE ${statement.table.name}`,
    details: statement.set.map((item) => snippet(ctx, item.range, 60)),
    range: statement.range,
    scope: 'main',
    columns: [],
  })
  addEdge(ctx, chain.current, updateId)
  return buildReturning(ctx, statement.returning, updateId, rowScope, 'main')
}

function buildDelete(
  ctx: Context,
  statement: Extract<Statement, { type: 'delete' }>,
): readonly Resolved[] {
  const root: Scope = { relations: [], outer: null, ctes: new Map() }
  const scope = statement.ctes.length === 0 ? root : buildCtes(ctx, statement.ctes, false, root)
  const target = targetRelation(
    ctx,
    statement.table,
    statement.alias,
    statement.table.range,
    scope,
    'main',
  )
  const using = buildFrom(
    ctx,
    statement.using,
    { relations: target.relations, outer: null, ctes: scope.ctes },
    'main',
  )
  const relations = [...target.relations, ...(using?.relations ?? [])]
  const rowScope: Scope = { relations, outer: null, ctes: scope.ctes }
  const chain = { current: target.nodeId }
  if (using !== null) {
    const joinId = addNode(ctx, {
      kind: 'join',
      label: 'JOIN',
      details: ['USING'],
      range: null,
      scope: 'main',
      columns: [],
    })
    addEdge(ctx, target.nodeId, joinId)
    addEdge(ctx, using.nodeId, joinId)
    chain.current = joinId
  }
  if (statement.where !== null) {
    const nodeId = nextIdReserved(ctx)
    const typing: Typing = {
      ctx,
      scope: rowScope,
      aliases: null,
      lookups: new Map(subqueriesOf(statement.where).map((query) => [query, nodeId])),
    }
    typeOf(typing, statement.where)
    collectParams(typing, statement.where, null, snippet(ctx, statement.where.range))
    ctx.nodes.push({
      id: nodeId,
      kind: 'filter',
      label: 'WHERE',
      details: [snippet(ctx, statement.where.range)],
      range: statement.where.range,
      scope: 'main',
      columns: [],
    })
    addEdge(ctx, chain.current, nodeId)
    chain.current = nodeId
  } else {
    warn(ctx, 'DELETE without WHERE removes every row', statement.range)
  }
  const deleteId = addNode(ctx, {
    kind: 'delete',
    label: `DELETE FROM ${statement.table.name}`,
    details: [],
    range: statement.range,
    scope: 'main',
    columns: [],
  })
  addEdge(ctx, chain.current, deleteId)
  return buildReturning(ctx, statement.returning, deleteId, rowScope, 'main')
}

// --- output ----------------------------------------------------------------------------------------------------

function tsUnion(type: TypeInfo) {
  const base = type.tsType === 'null' ? 'null' : type.tsType
  if (type.nullable === true && base !== 'null' && base !== 'unknown') return `${base} | null`
  return base
}

function isPlainKey(name: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name)
}

function rowTypeOf(columns: readonly Resolved[], kind: StatementKind) {
  if (columns.length === 0) return kind === 'select' ? '{}' : 'never'
  return `{ ${columns.map((column) => `${isPlainKey(column.name) ? column.name : JSON.stringify(column.name)}: ${tsUnion(column)}`).join('; ')} }`
}

/** Placeholders in the order a driver binds them: positional as written, `$n` by number, named by first appearance. */
function orderParams(ctx: Context): readonly Parameter[] {
  const numbered = ctx.params.every((param) => /^\$\d+$/u.test(param.placeholder))
  const named =
    ctx.params.length > 0 && ctx.params.every((param) => /^[:@$][A-Za-z_]/u.test(param.placeholder))
  const sorted = [...ctx.params].toSorted((a, b) => a.range.start - b.range.start)
  if (numbered) {
    const byIndex = new Map<number, (typeof sorted)[number]>()
    for (const param of sorted) {
      const index = Number(param.placeholder.slice(1))
      const existing = byIndex.get(index)
      if (
        existing === undefined ||
        (existing.type.tsType === 'unknown' && param.type.tsType !== 'unknown')
      ) {
        byIndex.set(index, param)
      }
    }
    return [...byIndex.entries()]
      .toSorted((a, b) => a[0] - b[0])
      .map(([index, param]) => ({
        index,
        placeholder: param.placeholder,
        dataType: param.type.dataType,
        tsType: param.type.tsType,
        nullable: param.type.nullable,
        context: param.context,
      }))
  }
  if (named) {
    const byName = new Map<string, (typeof sorted)[number]>()
    for (const param of sorted) {
      const existing = byName.get(param.placeholder)
      if (
        existing === undefined ||
        (existing.type.tsType === 'unknown' && param.type.tsType !== 'unknown')
      ) {
        byName.set(param.placeholder, param)
      }
    }
    return [...byName.values()].map((param, index) => ({
      index: index + 1,
      placeholder: param.placeholder,
      dataType: param.type.dataType,
      tsType: param.type.tsType,
      nullable: param.type.nullable,
      context: param.context,
    }))
  }
  return sorted.map((param, index) => ({
    index: index + 1,
    placeholder: param.placeholder,
    dataType: param.type.dataType,
    tsType: param.type.tsType,
    nullable: param.type.nullable,
    context: param.context,
  }))
}

function paramsTypeOf(params: readonly Parameter[]) {
  if (params.length === 0) return '[]'
  const named = params.every((param) => /^[:@$][A-Za-z_]/u.test(param.placeholder))
  const entry = (param: Parameter) =>
    tsUnion({
      dataType: param.dataType,
      tsType: param.tsType,
      nullable: param.nullable,
      sources: [],
    })
  if (named) {
    return `{ ${params.map((param) => `${param.placeholder.slice(1)}: ${entry(param)}`).join('; ')} }`
  }
  return `[${params.map(entry).join(', ')}]`
}

function finish(
  ctx: Context,
  kind: StatementKind,
  range: Range,
  columns: readonly Resolved[],
): StatementAnalysis {
  const parameters = orderParams(ctx)
  const nodes = ctx.nodes.map((node) => {
    const ref = ctx.refs.find((candidate) => candidate.nodeId === node.id)
    if (ref === undefined) return node
    const used = new Set([...ref.used].map((name) => name.toLowerCase()))
    return {
      ...node,
      columns: node.columns.map((column) => ({
        ...column,
        used: used.has(column.name.toLowerCase()),
      })),
    }
  })
  return {
    kind,
    text: ctx.text.slice(range.start, range.end),
    range,
    nodes,
    edges: ctx.edges,
    tables: ctx.refs.map((ref) => ({
      nodeId: ref.nodeId,
      name: ref.name,
      alias: ref.alias,
      scope: ref.scope,
      known: ref.known,
      columnsUsed: [...ref.used].filter(
        (name, index, all) =>
          all.findIndex((other) => other.toLowerCase() === name.toLowerCase()) === index,
      ),
      range: ref.range,
    })),
    columns: columns.map((column) => ({
      name: column.name,
      expression: column.expression,
      dataType: column.dataType,
      tsType: column.tsType,
      nullable: column.nullable,
      sources: column.sources,
    })),
    parameters,
    diagnostics: ctx.diagnostics,
    rowType: rowTypeOf(columns, kind),
    paramsType: paramsTypeOf(parameters),
  }
}

function makeContext(text: string, schema: AnalysisSchema): Context {
  return {
    dialect: schema.dialect,
    text,
    tables: new Map(schema.tables.map((table) => [table.name.toLowerCase(), table])),
    nodes: [],
    edges: [],
    refs: [],
    diagnostics: [],
    params: [],
    counter: 0,
  }
}

function analyzeStatement(
  text: string,
  statement: Statement,
  schema: AnalysisSchema,
): StatementAnalysis {
  const ctx = makeContext(text, schema)
  switch (statement.type) {
    case 'select': {
      const built = buildQuery(
        ctx,
        statement.query,
        { relations: [], outer: null, ctes: new Map() },
        'main',
      )
      return finish(ctx, 'select', statement.range, built.columns)
    }
    case 'insert':
      return finish(ctx, 'insert', statement.range, buildInsert(ctx, statement))
    case 'update':
      return finish(ctx, 'update', statement.range, buildUpdate(ctx, statement))
    case 'delete':
      return finish(ctx, 'delete', statement.range, buildDelete(ctx, statement))
    case 'other':
      warn(
        ctx,
        `${statement.keyword} statements are run as written; only SELECT, INSERT, UPDATE and DELETE are drawn`,
        statement.range,
        'info',
      )
      return finish(ctx, 'other', statement.range, [])
    case 'invalid':
      warn(
        ctx,
        statement.message,
        { start: statement.offset, end: Math.min(statement.offset + 1, text.length) },
        'error',
      )
      return finish(ctx, 'invalid', statement.range, [])
    default:
      return finish(ctx, 'other', { start: 0, end: text.length }, [])
  }
}

/** Every statement of the text, analyzed against the schema. */
export function analyze(text: string, schema: AnalysisSchema): Analysis {
  const statements = parseStatements(text)
  return { statements: statements.map((statement) => analyzeStatement(text, statement, schema)) }
}
