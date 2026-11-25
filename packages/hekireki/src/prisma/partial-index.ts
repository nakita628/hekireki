import type { DMMF } from '@prisma/generator-helper'

import { sqlString } from './postgres.js'
import { PRISMA_STRING, prismaString } from './schema-text.js'
import type { PrismaBlock } from './schema-text.js'

// The `where` of a partial index (the `partialIndexes` preview feature), which DMMF drops: read off
// the schema's text, and written as the SQL Prisma Migrate writes for it.

export const ATTRIBUTE_TOKEN = new RegExp(
  String.raw`${PRISMA_STRING}|[()[\]{}:,]|[^\s()[\]{}:,"]+`,
  'gu',
)

const OPENING = new Set(['(', '[', '{'])

const CLOSING = new Set([')', ']', '}'])

function nesting(tokens: readonly string[]) {
  return (
    tokens.filter((token) => OPENING.has(token)).length -
    tokens.filter((token) => CLOSING.has(token)).length
  )
}

// The tokens between the bracket at `open` and the one that closes it.
function enclosed(tokens: readonly string[], open: number) {
  const close = tokens.findIndex(
    (_, index) => index > open && nesting(tokens.slice(open, index + 1)) === 0,
  )
  return tokens.slice(open + 1, close === -1 ? tokens.length : close)
}

// Tokens split at the commas outside any bracket.
function commaSeparated(tokens: readonly string[]) {
  const commas = tokens.flatMap((token, index) =>
    token === ',' && nesting(tokens.slice(0, index)) === 0 ? [index] : [],
  )
  return [-1, ...commas]
    .map((comma, position) => tokens.slice(comma + 1, commas[position] ?? tokens.length))
    .filter((part) => part.length > 0)
}

// An attribute's arguments: `name: value` by name, a positional one under ''.
export function attributeArguments(tokens: readonly string[]) {
  return new Map(
    commaSeparated(tokens).map((part) => (part[1] === ':' ? [part[0], part.slice(2)] : ['', part])),
  )
}

/** What a partial index's `where` says: raw SQL, or equalities of fields to values. */
export type IndexCondition =
  | { readonly kind: 'raw'; readonly sql: string }
  | {
      readonly kind: 'fields'
      readonly terms: readonly {
        readonly field: string
        readonly not: boolean
        readonly value: string
      }[]
    }

function indexCondition(tokens: readonly string[]): IndexCondition | null {
  if (tokens[0] === 'raw' && tokens[1] === '(' && tokens[2]?.startsWith('"') === true) {
    return { kind: 'raw', sql: prismaString(tokens[2]) }
  }
  if (tokens[0] !== '{') return null
  const terms = commaSeparated(enclosed(tokens, 0)).map((entry) => {
    const [field = '', , ...value] = entry
    const negated = value[0] === '{' ? attributeArguments(enclosed(value, 0)).get('not') : undefined
    return negated === undefined
      ? { field, not: false, value: value[0] ?? '' }
      : { field, not: true, value: negated[0] ?? '' }
  })
  return { kind: 'fields', terms }
}

// The fields an @@index or @@unique lists, named or as its first argument.
function blockIndexFields(args: ReturnType<typeof attributeArguments>) {
  const list = args.get('fields') ?? args.get('') ?? []
  return commaSeparated(list[0] === '[' ? enclosed(list, 0) : list).flatMap((part) =>
    part[0] === undefined ? [] : [part[0]],
  )
}

// What tells a partial index apart, as one key: its model, whether it is unique, its map and its
// fields in order.
function conditionKey(
  model: string,
  unique: boolean,
  dbName: string | undefined,
  fields: readonly string[],
) {
  return JSON.stringify([model, unique, dbName ?? null, fields])
}

/**
 * The `where` of each partial index (the `partialIndexes` preview feature), with what tells the
 * index apart: its model, whether it is unique, its fields and its `map`. DMMF drops it, so it is
 * read off the schema's text.
 *
 * @param blocks - The blocks of the Prisma schema as written (all of its files, merged).
 * @returns Each index that has a `where`.
 */
export function indexConditions(blocks: readonly PrismaBlock[]) {
  return blocks
    .filter((block) => block.keyword === 'model')
    .flatMap((block) =>
      block.lines.flatMap((line) => {
        const tokens = line.match(ATTRIBUTE_TOKEN) ?? []
        const blockLevel = tokens[0] === '@@index' || tokens[0] === '@@unique'
        const fieldLevel = tokens.findIndex(
          (token, index) => index > 0 && token === '@unique' && tokens[index + 1] === '(',
        )
        const open = blockLevel ? 1 : fieldLevel + 1
        if ((!blockLevel && fieldLevel === -1) || tokens[open] !== '(') return []
        const args = attributeArguments(enclosed(tokens, open))
        const where = args.get('where')
        const condition = where === undefined ? null : indexCondition(where)
        if (condition === null) return []
        const fields = blockLevel ? blockIndexFields(args) : [tokens[0] ?? '']
        const map = args.get('map')?.[0]
        return [
          {
            model: block.name,
            unique: tokens[0] !== '@@index',
            fields,
            dbName: map === undefined ? undefined : prismaString(map),
            condition,
          },
        ]
      }),
    )
}

// A partial index's condition as Prisma Migrate writes it. Prisma takes true, false, null, a
// string or a number for a field, or `{ not: ... }` of one. SQL Server has no boolean literal, so
// there a Boolean is compared with 1 or 0 and a name is quoted in brackets.
function conditionSql(model: DMMF.Model, condition: IndexCondition, provider: string | undefined) {
  if (condition.kind === 'raw') return `(${condition.sql})`
  const sqlServer = provider === 'sqlserver'
  const byName = new Map(model.fields.map((f) => [f.name, f]))
  const terms = condition.terms.map((term) => {
    const field = byName.get(term.field)
    const column = sqlQuoted(field ? (field.dbName ?? field.name) : term.field, sqlServer)
    if (term.value === 'null') return `${column} IS ${term.not ? 'NOT ' : ''}NULL`
    return `${column} ${term.not ? '!=' : '='} ${conditionValue(term.value, sqlServer)}`
  })
  return `(${terms.join(' AND ')})`
}

function conditionValue(value: string, sqlServer: boolean) {
  if (value.startsWith('"')) return sqlString(prismaString(value))
  if (sqlServer && (value === 'true' || value === 'false')) return value === 'true' ? '1' : '0'
  return value
}

function sqlQuoted(name: string, sqlServer: boolean) {
  return sqlServer ? `[${name.replaceAll(']', ']]')}]` : `"${name.replaceAll('"', '""')}"`
}

/**
 * The condition of each partial index of a schema, as SQL, looked up by the index DMMF gives.
 *
 * @param blocks - The blocks of the Prisma schema as written (all of its files, merged).
 * @param provider - The datasource's provider, which the SQL is written for.
 * @returns For a model and one of its indexes (`unique` or `normal`), the `WHERE` condition of a
 *   partial one in parentheses, or undefined for an index that holds every row.
 */
export function partialIndexWhere(blocks: readonly PrismaBlock[], provider?: string) {
  const conditions = new Map<string, ReturnType<typeof indexConditions>[number]>()
  for (const c of indexConditions(blocks)) {
    const key = conditionKey(c.model, c.unique, c.dbName, c.fields)
    if (!conditions.has(key)) conditions.set(key, c)
  }
  return (
    model: DMMF.Model,
    index: {
      readonly type: string
      readonly dbName?: string | null
      readonly fields: readonly { readonly name: string }[]
    },
  ) => {
    // Only an @@index or a unique can be partial; a key (`id`) on the same fields is not one.
    if (index.type !== 'unique' && index.type !== 'normal') return undefined
    const condition = conditions.get(
      conditionKey(
        model.name,
        index.type === 'unique',
        index.dbName ?? undefined,
        index.fields.map((f) => f.name),
      ),
    )
    return condition === undefined ? undefined : conditionSql(model, condition.condition, provider)
  }
}

/**
 * The models, with `isUnique` set again on a field whose plain `@unique` DMMF leaves it off: it
 * does so when a partial unique index sits beside it on the same field, but the `@unique` holds
 * every row all the same. The key of a model without an `@id` (`primaryKeyFields`) is taken from
 * `isUnique`, so this comes before it.
 */
export function withPlainUniques(
  models: readonly DMMF.Model[],
  indexes: readonly DMMF.Index[],
  where: (model: DMMF.Model, index: DMMF.Index) => string | undefined,
) {
  const modelByName = new Map(models.map((m) => [m.name, m]))
  const unique = new Set(
    indexes
      .filter((i) => i.type === 'unique' && i.isDefinedOnField && i.fields.length === 1)
      .filter((i) => {
        const model = modelByName.get(i.model)
        return model !== undefined && where(model, i) === undefined
      })
      .map((i) => `${i.model}.${i.fields[0]?.name ?? ''}`),
  )
  const isPlainUnique = (model: DMMF.Model, f: DMMF.Field) =>
    !f.isUnique && unique.has(`${model.name}.${f.name}`)
  return models.map((model) =>
    model.fields.some((f) => isPlainUnique(model, f))
      ? {
          ...model,
          fields: model.fields.map((f) => (isPlainUnique(model, f) ? { ...f, isUnique: true } : f)),
        }
      : model,
  )
}
