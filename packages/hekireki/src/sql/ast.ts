/**
 * The SQL syntax tree the parser builds and the analyzer reads. It covers what a query against
 * an application database is written with — SELECT with joins, subqueries, CTEs, set operations,
 * window functions and CASE; INSERT / UPDATE / DELETE with RETURNING — and keeps a `raw` node for
 * the expression shapes it does not model, so an unusual construct never blocks the picture.
 */

/** Character offsets into the statement text, end exclusive. */
export type Range = { readonly start: number; readonly end: number }

export type ColumnRef = {
  readonly type: 'column'
  /** The qualifier as written (`u` in `u.id`), or null for a bare name. */
  readonly table: string | null
  readonly name: string
  readonly range: Range
}

export type Literal = {
  readonly type: 'literal'
  readonly kind: 'string' | 'number' | 'boolean' | 'null'
  readonly value: string
  readonly range: Range
}

export type WindowSpec = {
  readonly partitionBy: readonly Expr[]
  readonly orderBy: readonly OrderItem[]
  readonly range: Range
}

export type CaseBranch = { readonly when: Expr; readonly result: Expr }

export type Expr =
  | ColumnRef
  | { readonly type: 'star'; readonly table: string | null; readonly range: Range }
  | Literal
  | { readonly type: 'param'; readonly placeholder: string; readonly range: Range }
  | {
      readonly type: 'binary'
      readonly op: string
      readonly left: Expr
      readonly right: Expr
      readonly range: Range
    }
  | { readonly type: 'unary'; readonly op: string; readonly operand: Expr; readonly range: Range }
  | {
      readonly type: 'call'
      readonly name: string
      readonly args: readonly Expr[]
      readonly distinct: boolean
      readonly over: WindowSpec | null
      readonly range: Range
    }
  | { readonly type: 'cast'; readonly expr: Expr; readonly to: string; readonly range: Range }
  | {
      readonly type: 'case'
      readonly operand: Expr | null
      readonly whens: readonly CaseBranch[]
      readonly otherwise: Expr | null
      readonly range: Range
    }
  | {
      readonly type: 'in'
      readonly expr: Expr
      readonly not: boolean
      readonly list: readonly Expr[] | null
      readonly subquery: Query | null
      readonly range: Range
    }
  | {
      readonly type: 'between'
      readonly expr: Expr
      readonly not: boolean
      readonly low: Expr
      readonly high: Expr
      readonly range: Range
    }
  | {
      readonly type: 'like'
      readonly op: string
      readonly expr: Expr
      readonly not: boolean
      readonly pattern: Expr
      readonly range: Range
    }
  | {
      readonly type: 'is'
      readonly expr: Expr
      readonly not: boolean
      readonly value: 'NULL' | 'TRUE' | 'FALSE' | 'UNKNOWN'
      readonly range: Range
    }
  | { readonly type: 'exists'; readonly not: boolean; readonly query: Query; readonly range: Range }
  | { readonly type: 'subquery'; readonly query: Query; readonly range: Range }
  | { readonly type: 'list'; readonly items: readonly Expr[]; readonly range: Range }
  | { readonly type: 'raw'; readonly text: string; readonly range: Range }

export type OrderItem = {
  readonly expr: Expr
  readonly direction: 'ASC' | 'DESC' | null
  readonly range: Range
}

export type SelectItem = {
  readonly expr: Expr
  readonly alias: string | null
  readonly range: Range
}

export type TableName = {
  readonly schema: string | null
  readonly name: string
  readonly range: Range
}

export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS'

export type FromItem =
  | {
      readonly type: 'table'
      readonly table: TableName
      readonly alias: string | null
      readonly range: Range
    }
  | {
      readonly type: 'subquery'
      readonly query: Query
      readonly alias: string | null
      readonly lateral: boolean
      readonly range: Range
    }
  | {
      readonly type: 'function'
      readonly call: Expr
      readonly alias: string | null
      readonly range: Range
    }
  | {
      readonly type: 'join'
      readonly joinType: JoinType
      readonly natural: boolean
      readonly left: FromItem
      readonly right: FromItem
      readonly on: Expr | null
      readonly using: readonly string[] | null
      readonly range: Range
    }

export type SelectCore = {
  readonly type: 'select'
  readonly distinct: boolean
  readonly columns: readonly SelectItem[]
  readonly from: readonly FromItem[]
  readonly where: Expr | null
  readonly groupBy: readonly Expr[]
  readonly having: Expr | null
  readonly range: Range
}

export type QueryBody =
  | SelectCore
  | {
      readonly type: 'setop'
      readonly op: 'UNION' | 'INTERSECT' | 'EXCEPT'
      readonly all: boolean
      readonly left: QueryBody
      readonly right: QueryBody
      readonly range: Range
    }
  | { readonly type: 'values'; readonly rows: readonly (readonly Expr[])[]; readonly range: Range }

export type Cte = {
  readonly name: string
  readonly columns: readonly string[] | null
  readonly query: Query
  readonly range: Range
}

/** A query expression: optional CTEs, a body, and the ORDER BY / LIMIT that apply to the whole. */
export type Query = {
  readonly type: 'query'
  readonly ctes: readonly Cte[]
  readonly recursive: boolean
  readonly body: QueryBody
  readonly orderBy: readonly OrderItem[]
  readonly limit: Expr | null
  readonly offset: Expr | null
  readonly range: Range
}

export type InsertSource =
  | { readonly type: 'values'; readonly rows: readonly (readonly Expr[])[]; readonly range: Range }
  | { readonly type: 'query'; readonly query: Query; readonly range: Range }
  | { readonly type: 'default'; readonly range: Range }

export type SetItem = { readonly column: string; readonly value: Expr; readonly range: Range }

export type Statement =
  | { readonly type: 'select'; readonly query: Query; readonly range: Range }
  | {
      readonly type: 'insert'
      readonly ctes: readonly Cte[]
      readonly table: TableName
      readonly alias: string | null
      readonly columns: readonly string[] | null
      readonly source: InsertSource
      readonly onConflict: Range | null
      readonly returning: readonly SelectItem[] | null
      readonly range: Range
    }
  | {
      readonly type: 'update'
      readonly ctes: readonly Cte[]
      readonly table: TableName
      readonly alias: string | null
      readonly set: readonly SetItem[]
      readonly from: readonly FromItem[]
      readonly where: Expr | null
      readonly returning: readonly SelectItem[] | null
      readonly range: Range
    }
  | {
      readonly type: 'delete'
      readonly ctes: readonly Cte[]
      readonly table: TableName
      readonly alias: string | null
      readonly using: readonly FromItem[]
      readonly where: Expr | null
      readonly returning: readonly SelectItem[] | null
      readonly range: Range
    }
  | { readonly type: 'other'; readonly keyword: string; readonly range: Range }
  | {
      readonly type: 'invalid'
      readonly message: string
      readonly offset: number
      readonly range: Range
    }
