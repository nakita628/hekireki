import { describe, expect, it } from 'vite-plus/test'

import { analyze } from './analyze.js'
import type { AnalysisSchema, StatementAnalysis } from './analyze.js'

const schema: AnalysisSchema = {
  dialect: 'sqlite',
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', dataType: 'INTEGER', nullable: false },
        { name: 'name', dataType: 'TEXT', nullable: false },
        { name: 'email', dataType: 'TEXT', nullable: true },
      ],
    },
    {
      name: 'posts',
      columns: [
        { name: 'id', dataType: 'INTEGER', nullable: false },
        { name: 'user_id', dataType: 'INTEGER', nullable: false },
        { name: 'title', dataType: 'TEXT', nullable: false },
        { name: 'published', dataType: 'INTEGER', nullable: false },
      ],
    },
  ],
}

function first(text: string, against: AnalysisSchema = schema): StatementAnalysis {
  const [statement] = analyze(text, against).statements
  if (statement === undefined) throw new Error('expected a statement')
  return statement
}

function chain(statement: StatementAnalysis) {
  return statement.nodes.map((node) => `${node.kind}:${node.label}`)
}

function flows(statement: StatementAnalysis) {
  const label = (id: string) => statement.nodes.find((node) => node.id === id)?.label ?? id
  return statement.edges.map(
    (edge) =>
      `${label(edge.source)} -> ${label(edge.target)}${edge.label === null ? '' : ` (${edge.label})`}${edge.kind === 'lookup' ? ' [lookup]' : ''}`,
  )
}

describe('analyze', () => {
  it('draws a SELECT as sources, join, filter, grouping, projection, sort and limit', () => {
    const statement = first(
      'SELECT u.id, count(p.id) AS posts FROM users u LEFT JOIN posts p ON p.user_id = u.id WHERE u.email IS NOT NULL GROUP BY u.id ORDER BY posts DESC LIMIT 5',
    )
    expect(chain(statement)).toStrictEqual([
      'table:users AS u',
      'table:posts AS p',
      'join:LEFT JOIN',
      'filter:WHERE',
      'aggregate:GROUP BY',
      'project:SELECT',
      'sort:ORDER BY',
      'limit:LIMIT',
    ])
    expect(flows(statement)).toStrictEqual([
      'users AS u -> LEFT JOIN',
      'posts AS p -> LEFT JOIN (optional)',
      'LEFT JOIN -> WHERE',
      'WHERE -> GROUP BY',
      'GROUP BY -> SELECT',
      'SELECT -> ORDER BY',
      'ORDER BY -> LIMIT',
    ])
    expect(statement.rowType).toBe('{ id: number; posts: number }')
    expect(statement.diagnostics).toStrictEqual([])
  })

  it('carries lineage and nullability: a LEFT JOIN makes the right side nullable', () => {
    const statement = first(
      'SELECT u.name, p.title FROM users u LEFT JOIN posts p ON p.user_id = u.id',
    )
    expect(statement.columns).toStrictEqual([
      {
        name: 'name',
        expression: 'u.name',
        dataType: 'TEXT',
        tsType: 'string',
        nullable: false,
        sources: [{ table: 'users', column: 'name' }],
      },
      {
        name: 'title',
        expression: 'p.title',
        dataType: 'TEXT',
        tsType: 'string',
        nullable: true,
        sources: [{ table: 'posts', column: 'title' }],
      },
    ])
    expect(statement.rowType).toBe('{ name: string; title: string | null }')
  })

  it('expands * from the tables in scope and marks the columns as used', () => {
    const statement = first('SELECT * FROM users')
    expect(statement.columns.map((column) => column.name)).toStrictEqual(['id', 'name', 'email'])
    expect(statement.nodes[0]?.columns).toStrictEqual([
      { name: 'id', dataType: 'INTEGER', used: true },
      { name: 'name', dataType: 'TEXT', used: true },
      { name: 'email', dataType: 'TEXT', used: true },
    ])
    expect(statement.tables).toStrictEqual([
      {
        nodeId: 'n1',
        name: 'users',
        alias: null,
        scope: 'main',
        known: true,
        columnsUsed: ['id', 'name', 'email'],
        range: { start: 14, end: 19 },
      },
    ])
  })

  it('types placeholders by what they stand beside, in bind order', () => {
    const statement = first(
      'SELECT id FROM users WHERE id IN (?, ?) AND email LIKE ? AND name = ? LIMIT ?',
    )
    expect(
      statement.parameters.map((parameter) => [
        parameter.index,
        parameter.tsType,
        parameter.nullable,
        parameter.context,
      ]),
    ).toStrictEqual([
      [1, 'number', false, 'id IN (?, ?)'],
      [2, 'number', false, 'id IN (?, ?)'],
      [3, 'string', false, 'email LIKE ?'],
      [4, 'string', false, 'name = ?'],
      [5, 'number', false, 'LIMIT ?'],
    ])
    expect(statement.paramsType).toBe('[number, number, string, string, number]')
  })

  it('orders $n placeholders by number and names :name placeholders as an object', () => {
    expect(first('SELECT id FROM users WHERE name = $2 AND id = $1').paramsType).toBe(
      '[number, string]',
    )
    expect(
      first('SELECT id FROM users WHERE name = :name AND id = :id AND email = :name').paramsType,
    ).toBe('{ name: string; id: number }')
  })

  it('reads a CTE once and feeds every reference from its node', () => {
    const statement = first(
      'WITH c AS (SELECT user_id, count(*) AS n FROM posts GROUP BY user_id) SELECT u.name, c.n FROM users u JOIN c ON c.user_id = u.id',
    )
    expect(chain(statement)).toStrictEqual([
      'table:posts',
      'aggregate:GROUP BY',
      'project:SELECT',
      'cte:WITH c',
      'table:users AS u',
      'join:INNER JOIN',
      'project:SELECT',
    ])
    expect(flows(statement)).toStrictEqual([
      'posts -> GROUP BY',
      'GROUP BY -> SELECT',
      'SELECT -> WITH c',
      'users AS u -> INNER JOIN',
      'WITH c -> INNER JOIN',
      'INNER JOIN -> SELECT',
    ])
    expect(statement.rowType).toBe('{ name: string; n: number }')
    expect(statement.nodes[0]?.scope).toBe('c')
  })

  it('hangs a scalar subquery off the clause it sits in with a lookup edge, reading the outer row', () => {
    const statement = first(
      'SELECT u.id, (SELECT max(id) FROM posts WHERE user_id = u.id) AS last_post FROM users u',
    )
    expect(flows(statement)).toStrictEqual([
      'posts -> WHERE',
      'WHERE -> GROUP BY',
      'GROUP BY -> SELECT',
      'SELECT -> SELECT (scalar) [lookup]',
      'users AS u -> SELECT',
    ])
    expect(statement.rowType).toBe('{ id: number; last_post: number | null }')
    expect(statement.diagnostics).toStrictEqual([])
  })

  it('combines the sides of a UNION and warns on a column count mismatch', () => {
    const statement = first('SELECT id, name FROM users UNION ALL SELECT id FROM posts')
    expect(chain(statement).at(-1)).toBe('union:UNION ALL')
    expect(statement.diagnostics).toStrictEqual([
      {
        severity: 'warning',
        message: 'UNION: the left side has 2 columns, the right side 1',
        range: { start: 0, end: 57 },
      },
    ])
  })

  it('reports an unknown table, an unknown column and an ambiguous one', () => {
    expect(first('SELECT nmae FROM users').diagnostics).toStrictEqual([
      { severity: 'warning', message: 'Unknown column "nmae"', range: { start: 7, end: 11 } },
    ])
    expect(first('SELECT id FROM nope').diagnostics).toStrictEqual([
      { severity: 'warning', message: 'Unknown table "nope"', range: { start: 15, end: 19 } },
    ])
    expect(
      first('SELECT id FROM users u JOIN posts p ON p.user_id = u.id').diagnostics,
    ).toStrictEqual([
      {
        severity: 'warning',
        message: '"id" is ambiguous: it is a column of "u" and "p"',
        range: { start: 7, end: 9 },
      },
    ])
  })

  it('says nothing about tables when there is no schema to check against', () => {
    const statement = first('SELECT a FROM t', { dialect: 'sqlite', tables: [] })
    expect(statement.diagnostics).toStrictEqual([
      { severity: 'info', message: 'Unknown table "t"', range: { start: 14, end: 15 } },
    ])
    expect(statement.rowType).toBe('{ a: unknown }')
  })

  it('draws INSERT with its VALUES, typed against the target columns, and RETURNING', () => {
    const statement = first('INSERT INTO users (name, email) VALUES (?, ?) RETURNING id')
    expect(chain(statement)).toStrictEqual([
      'values:VALUES',
      'table:users',
      'insert:INSERT INTO users',
      'returning:RETURNING',
    ])
    expect(
      statement.parameters.map((parameter) => [
        parameter.tsType,
        parameter.nullable,
        parameter.context,
      ]),
    ).toStrictEqual([
      ['string', false, 'users.name'],
      ['string', true, 'users.email'],
    ])
    expect(statement.paramsType).toBe('[string, string | null]')
    expect(statement.rowType).toBe('{ id: number }')
  })

  it('draws UPDATE and DELETE, and warns when either has no WHERE', () => {
    const update = first('UPDATE posts SET title = ? WHERE id = ?')
    expect(chain(update)).toStrictEqual(['table:posts', 'filter:WHERE', 'update:UPDATE posts'])
    expect(update.paramsType).toBe('[string, number]')
    expect(update.rowType).toBe('never')
    const remove = first('DELETE FROM posts')
    expect(chain(remove)).toStrictEqual(['table:posts', 'delete:DELETE FROM posts'])
    expect(remove.diagnostics).toStrictEqual([
      {
        severity: 'warning',
        message: 'DELETE without WHERE removes every row',
        range: { start: 0, end: 17 },
      },
    ])
  })

  it('types the common functions and expressions', () => {
    const statement = first(
      "SELECT count(*) AS n, coalesce(email, 'none') AS mail, lower(name) AS lname, id * 2 AS twice, published = 1 AS flag, CASE WHEN id > 1 THEN 'x' END AS tag FROM users JOIN posts ON posts.user_id = users.id",
    )
    expect(
      statement.columns.map(
        (column) => `${column.name}: ${column.tsType}${column.nullable === true ? ' | null' : ''}`,
      ),
    ).toStrictEqual([
      'n: number',
      'mail: string',
      'lname: string',
      'twice: number',
      'flag: number',
      'tag: string | null',
    ])
  })

  it('names unaliased columns the way each dialect does', () => {
    const postgres: AnalysisSchema = { ...schema, dialect: 'postgresql' }
    expect(
      first('SELECT count(*), id + 1, name FROM users', postgres).columns.map(
        (column) => column.name,
      ),
    ).toStrictEqual(['count', '?column?', 'name'])
    expect(
      first('SELECT count(*), id + 1 FROM users').columns.map((column) => column.name),
    ).toStrictEqual(['count(*)', 'id + 1'])
  })

  it('reports an unreadable statement as invalid, and DDL as other', () => {
    const [invalid, other] = analyze('SELECT FROM; CREATE TABLE x (id INTEGER)', schema).statements
    expect(invalid?.kind).toBe('invalid')
    expect(invalid?.diagnostics).toStrictEqual([
      { severity: 'error', message: 'Unexpected "FROM"', range: { start: 7, end: 8 } },
    ])
    expect(other?.kind).toBe('other')
    expect(other?.nodes).toStrictEqual([])
  })
})
