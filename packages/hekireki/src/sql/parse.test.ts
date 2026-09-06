import { describe, expect, it } from 'vite-plus/test'

import type { Expr, Statement } from './ast.js'
import { parseQueryText, parseStatements } from './parse.js'

/** The expression tree without ranges, for readable assertions. */
function shape(expr: Expr): unknown {
  switch (expr.type) {
    case 'column':
      return expr.table === null ? expr.name : `${expr.table}.${expr.name}`
    case 'star':
      return expr.table === null ? '*' : `${expr.table}.*`
    case 'literal':
      return { [expr.kind]: expr.value }
    case 'param':
      return { param: expr.placeholder }
    case 'binary':
      return [shape(expr.left), expr.op, shape(expr.right)]
    case 'unary':
      return [expr.op, shape(expr.operand)]
    case 'call':
      return {
        call: expr.name,
        args: expr.args.map(shape),
        distinct: expr.distinct,
        over: expr.over !== null,
      }
    case 'cast':
      return { cast: shape(expr.expr), to: expr.to }
    case 'case':
      return {
        case: expr.operand === null ? null : shape(expr.operand),
        whens: expr.whens.map((branch) => [shape(branch.when), shape(branch.result)]),
        else: expr.otherwise === null ? null : shape(expr.otherwise),
      }
    case 'in':
      return {
        in: shape(expr.expr),
        not: expr.not,
        list: expr.list?.map(shape) ?? null,
        subquery: expr.subquery !== null,
      }
    case 'between':
      return {
        between: shape(expr.expr),
        not: expr.not,
        low: shape(expr.low),
        high: shape(expr.high),
      }
    case 'like':
      return { like: shape(expr.expr), op: expr.op, not: expr.not, pattern: shape(expr.pattern) }
    case 'is':
      return { is: shape(expr.expr), not: expr.not, value: expr.value }
    case 'exists':
      return { exists: true }
    case 'subquery':
      return { subquery: true }
    case 'list':
      return { list: expr.items.map(shape) }
    case 'raw':
      return { raw: expr.text }
    default:
      return null
  }
}

function whereOf(text: string) {
  const query = parseQueryText(text)
  if (query?.body.type !== 'select' || query.body.where === null) {
    throw new Error('expected a SELECT with WHERE')
  }
  return shape(query.body.where)
}

function selectOf(text: string) {
  const query = parseQueryText(text)
  if (query?.body.type !== 'select') throw new Error('expected a SELECT')
  return query.body.columns.map((item) => [shape(item.expr), item.alias])
}

function only(statements: readonly Statement[]) {
  const [first] = statements
  if (first === undefined || statements.length !== 1) throw new Error('expected one statement')
  return first
}

describe('parseStatements', () => {
  it('reads the clauses of a SELECT with their ranges', () => {
    const text =
      'SELECT a, b AS bee FROM t WHERE a = 1 GROUP BY a HAVING count(*) > 1 ORDER BY b DESC LIMIT 10 OFFSET 5'
    const statement = only(parseStatements(text))
    if (statement.type !== 'select' || statement.query.body.type !== 'select') {
      throw new Error('expected a SELECT')
    }
    const { body, orderBy, limit, offset } = statement.query
    expect(body.columns.map((item) => [shape(item.expr), item.alias])).toStrictEqual([
      ['a', null],
      ['b', 'bee'],
    ])
    expect(body.from).toStrictEqual([
      {
        type: 'table',
        table: { schema: null, name: 't', range: { start: 24, end: 25 } },
        alias: null,
        range: { start: 24, end: 25 },
      },
    ])
    expect(body.where === null ? null : shape(body.where)).toStrictEqual([
      'a',
      '=',
      { number: '1' },
    ])
    expect(body.where?.range).toStrictEqual({ start: 32, end: 37 })
    expect(body.groupBy.map(shape)).toStrictEqual(['a'])
    expect(body.having === null ? null : shape(body.having)).toStrictEqual([
      { call: 'count', args: ['*'], distinct: false, over: false },
      '>',
      { number: '1' },
    ])
    expect(orderBy.map((item) => [shape(item.expr), item.direction])).toStrictEqual([['b', 'DESC']])
    expect(limit === null ? null : shape(limit)).toStrictEqual({ number: '10' })
    expect(offset === null ? null : shape(offset)).toStrictEqual({ number: '5' })
    expect(statement.range).toStrictEqual({ start: 0, end: text.length })
  })

  it('binds operators by precedence: OR < AND < NOT < comparison < || < + < *', () => {
    expect(whereOf('SELECT 1 FROM t WHERE a = 1 OR b > 2 AND NOT c')).toStrictEqual([
      ['a', '=', { number: '1' }],
      'OR',
      [['b', '>', { number: '2' }], 'AND', ['NOT', 'c']],
    ])
    expect(whereOf("SELECT 1 FROM t WHERE a || 'x' = b + c * 2")).toStrictEqual([
      ['a', '||', { string: 'x' }],
      '=',
      ['b', '+', ['c', '*', { number: '2' }]],
    ])
  })

  it('reads IN, BETWEEN, LIKE, IS and their negations', () => {
    expect(
      whereOf(
        'SELECT 1 FROM t WHERE a IN (1, 2) AND b NOT IN (SELECT id FROM u) AND c BETWEEN 1 AND 5 AND d NOT LIKE ? AND e IS NOT NULL',
      ),
    ).toStrictEqual([
      [
        [
          [
            { in: 'a', not: false, list: [{ number: '1' }, { number: '2' }], subquery: false },
            'AND',
            { in: 'b', not: true, list: null, subquery: true },
          ],
          'AND',
          { between: 'c', not: false, low: { number: '1' }, high: { number: '5' } },
        ],
        'AND',
        { like: 'd', op: 'LIKE', not: true, pattern: { param: '?' } },
      ],
      'AND',
      { is: 'e', not: true, value: 'NULL' },
    ])
  })

  it('reads CASE, CAST, ::, window functions and DISTINCT aggregates', () => {
    expect(
      selectOf(
        "SELECT CASE WHEN a > 1 THEN 'big' ELSE 'small' END, CAST(b AS TEXT), c::int, row_number() OVER (PARTITION BY d ORDER BY e), count(DISTINCT f) FROM t",
      ),
    ).toStrictEqual([
      [
        {
          case: null,
          whens: [[['a', '>', { number: '1' }], { string: 'big' }]],
          else: { string: 'small' },
        },
        null,
      ],
      [{ cast: 'b', to: 'TEXT' }, null],
      [{ cast: 'c', to: 'int' }, null],
      [{ call: 'row_number', args: [], distinct: false, over: true }, null],
      [{ call: 'count', args: ['f'], distinct: true, over: false }, null],
    ])
  })

  it('reads joins with ON and USING, and a subquery in FROM', () => {
    const query = parseQueryText(
      'SELECT * FROM a LEFT JOIN b ON b.a_id = a.id JOIN (SELECT id FROM c) sub USING (id)',
    )
    if (query?.body.type !== 'select') throw new Error('expected a SELECT')
    const [from] = query.body.from
    if (from?.type !== 'join' || from.left.type !== 'join') throw new Error('expected nested joins')
    expect(from.joinType).toBe('INNER')
    expect(from.using).toStrictEqual(['id'])
    expect(from.right.type).toBe('subquery')
    expect(from.left.joinType).toBe('LEFT')
    expect(from.left.on === null ? null : shape(from.left.on)).toStrictEqual([
      'b.a_id',
      '=',
      'a.id',
    ])
  })

  it('reads CTEs, set operations and VALUES', () => {
    const query = parseQueryText(
      'WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 5) SELECT x FROM n',
    )
    if (query === null) throw new Error('expected a query')
    expect(query.recursive).toBe(true)
    expect(query.ctes.map((cte) => [cte.name, cte.columns])).toStrictEqual([['n', ['x']]])
    const inner = query.ctes[0]?.query.body
    expect(inner?.type).toBe('setop')
    if (inner?.type !== 'setop') throw new Error('expected a set operation')
    expect([inner.op, inner.all]).toStrictEqual(['UNION', true])
    const values = parseQueryText('VALUES (1, 2), (3, 4)')
    expect(values?.body.type).toBe('values')
  })

  it('reads INSERT, UPDATE and DELETE with RETURNING', () => {
    const [insert, update, remove] = parseStatements(
      'INSERT INTO t (a, b) VALUES (?, ?), (1, 2) ON CONFLICT (a) DO NOTHING RETURNING id; UPDATE t AS x SET a = ?, b = DEFAULT WHERE id = $1 RETURNING *; DELETE FROM t WHERE a IN (:ids)',
    )
    if (insert?.type !== 'insert' || update?.type !== 'update' || remove?.type !== 'delete') {
      throw new Error('expected insert, update, delete')
    }
    expect(insert.columns).toStrictEqual(['a', 'b'])
    expect(insert.source.type).toBe('values')
    expect(insert.onConflict).not.toBeNull()
    expect(insert.returning?.map((item) => shape(item.expr))).toStrictEqual(['id'])
    expect(update.alias).toBe('x')
    expect(update.set.map((item) => [item.column, shape(item.value)])).toStrictEqual([
      ['a', { param: '?' }],
      ['b', { raw: 'DEFAULT' }],
    ])
    expect(update.returning?.map((item) => shape(item.expr))).toStrictEqual(['*'])
    expect(remove.where === null ? null : shape(remove.where)).toStrictEqual({
      in: 'a',
      not: false,
      list: [{ param: ':ids' }],
      subquery: false,
    })
  })

  it('reports an unreadable statement with its offset and keeps reading the next one', () => {
    const [bad, good] = parseStatements('SELECT FROM WHERE; SELECT 1')
    expect(bad).toStrictEqual({
      type: 'invalid',
      message: 'Unexpected "FROM"',
      offset: 7,
      range: { start: 0, end: 17 },
    })
    expect(good?.type).toBe('select')
  })

  it('passes DDL and PRAGMA through as other statements', () => {
    expect(
      parseStatements('CREATE TABLE t (id INTEGER); PRAGMA table_info(t)').map(
        (statement) => statement.type,
      ),
    ).toStrictEqual(['other', 'other'])
  })

  it('lets a soft keyword name a column', () => {
    expect(selectOf('SELECT first, last, rows, "window" FROM t')).toStrictEqual([
      ['first', null],
      ['last', null],
      ['rows', null],
      ['window', null],
    ])
  })
})
