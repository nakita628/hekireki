import type { DMMF } from '@prisma/generator-helper'
import * as z from 'zod'

import { lowerFirst } from '../utils/index.js'

/**
 * One query of a model as the docs show it: the Prisma Client call, and the request the client
 * sends the query compiler for it (Prisma's JSON protocol), which the SQL is compiled from.
 */
export type QueryExample = {
  readonly model: string
  readonly name: string
  readonly description: string
  readonly code: string
  readonly request: {
    readonly modelName: string
    readonly action: string
    readonly query: { readonly arguments: object; readonly selection: object }
  }
}

/** A statement the query compiler planned: the SQL with its placeholders, and their values. */
export type PlannedStatement = { readonly sql: string; readonly params: readonly unknown[] }

/** A value of each scalar type: as the call writes it, and as the JSON protocol carries it. */
const SAMPLES: Readonly<Record<string, { readonly code: string; readonly json: unknown }>> = {
  String: { code: "'example'", json: 'example' },
  Int: { code: '1', json: 1 },
  BigInt: { code: '1n', json: { $type: 'BigInt', value: '1' } },
  Float: { code: '1.5', json: 1.5 },
  Decimal: { code: "'9.99'", json: { $type: 'Decimal', value: '9.99' } },
  Boolean: { code: 'true', json: true },
  DateTime: {
    code: "new Date('2026-01-01T00:00:00.000Z')",
    json: { $type: 'DateTime', value: '2026-01-01T00:00:00.000Z' },
  },
  Json: { code: '{}', json: { $type: 'Json', value: '{}' } },
  Bytes: { code: 'Uint8Array.from([1, 2, 3])', json: { $type: 'Bytes', value: 'AQID' } },
}

const SCALARS = { $scalars: true, $composites: true } as const

function sampleOf(field: DMMF.Field, enums: readonly DMMF.DatamodelEnum[]) {
  const value =
    field.kind === 'enum'
      ? (() => {
          const first = enums.find((e) => e.name === field.type)?.values[0]?.name
          return first === undefined ? undefined : { code: `'${first}'`, json: first }
        })()
      : field.kind === 'scalar'
        ? SAMPLES[field.type]
        : undefined
  if (value === undefined) return null
  return field.isList ? { code: `[${value.code}]`, json: [value.json] } : value
}

type Entry = { readonly key: string; readonly code: string; readonly json: unknown }

// An object literal of the call and the JSON protocol's object, from the same entries.
function objectOf(entries: readonly Entry[]) {
  return {
    code: `{ ${entries.map((entry) => `${entry.key}: ${entry.code}`).join(', ')} }`,
    json: Object.fromEntries(entries.map((entry) => [entry.key, entry.json])),
  }
}

// Each field with a value of its type, or null when one of them has no value to write.
function entriesOf(fields: readonly DMMF.Field[], enums: readonly DMMF.DatamodelEnum[]) {
  const entries = fields.flatMap((field): Entry[] => {
    const value = sampleOf(field, enums)
    return value === null ? [] : [{ key: field.name, code: value.code, json: value.json }]
  })
  return entries.length === fields.length ? entries : null
}

/**
 * The `where` that finds one row: the primary key, else the first unique field, else the first
 * unique set of fields, a compound one under the name Prisma gives it (`a_b`). Null for a model
 * nothing unique identifies, which `findUnique`, `update` and `delete` cannot be called on.
 */
function uniqueWhere(model: DMMF.Model, enums: readonly DMMF.DatamodelEnum[]) {
  const single = model.fields.find((f) => f.isId) ?? model.fields.find((f) => f.isUnique)
  const key = model.primaryKey ?? (single === undefined ? (model.uniqueIndexes[0] ?? null) : null)
  // `@@id([a])` and `@@unique([a])` mark the field itself, and Prisma Client finds it by `a`.
  const compound = key !== null && key.fields.length > 1 ? key : null
  if (compound === null) {
    const entries = single === undefined ? null : entriesOf([single], enums)
    return single === undefined || entries === null
      ? null
      : { fields: [single.name], where: objectOf(entries) }
  }
  const fields = compound.fields.flatMap((name) => model.fields.filter((f) => f.name === name))
  const entries = entriesOf(fields, enums)
  if (entries === null || fields.length !== compound.fields.length) return null
  const inner = objectOf(entries)
  return {
    fields: compound.fields,
    where: objectOf([
      { key: compound.name ?? compound.fields.join('_'), code: inner.code, json: inner.json },
    ]),
  }
}

/**
 * Each model's queries as the docs show them: every row, how many, the rows with their relations
 * (for a model with one), one row by what is unique to it, and a create, update and delete, with a
 * value of each field's type. A query the model cannot take (no unique field to find one row by,
 * a required field of a type with no value to write) is left out, and so is one Prisma Client
 * does not give it: a view is read and not written.
 *
 * @param document.datamodel - the models and enums Prisma parsed
 * @param document.mappings - the operations Prisma Client gives each model
 * @returns the queries, model by model
 */
export function queryExamples(
  document: Pick<DMMF.Document, 'datamodel' | 'mappings'>,
): readonly QueryExample[] {
  const { datamodel } = document
  return datamodel.models.flatMap((model) => {
    // The actions the client has for the model, by the name the JSON protocol gives each.
    const mapping = document.mappings.modelOperations.find((m) => m.model === model.name)
    const actions = new Set(
      Object.entries(mapping ?? {}).flatMap(([action, name]) =>
        typeof name === 'string' && action !== 'model' && action !== 'plural' ? [action] : [],
      ),
    )
    const client = `prisma.${lowerFirst(model.name)}`
    const example = (
      name: string,
      description: string,
      code: string,
      action: string,
      query: QueryExample['request']['query'],
    ): QueryExample => ({
      model: model.name,
      name,
      description,
      code,
      request: { modelName: model.name, action, query },
    })
    const relations = model.fields.filter((f) => f.kind === 'object')
    const include = objectOf(relations.map((f) => ({ key: f.name, code: 'true', json: true })))
    const unique = uniqueWhere(model, datamodel.enums)
    const where = unique?.where ?? null
    // What a create has to be given: every required column with no default of its own.
    const required = model.fields.filter(
      (f) =>
        (f.kind === 'scalar' || f.kind === 'enum') &&
        f.isRequired &&
        !f.hasDefaultValue &&
        !f.isUpdatedAt &&
        !f.isGenerated,
    )
    const createEntries = entriesOf(required, datamodel.enums)
    const create = createEntries === null ? null : objectOf(createEntries)
    // An update writes one column that neither finds the row nor holds a key of another table.
    const keys = new Set(relations.flatMap((f) => f.relationFromFields ?? []))
    const updated = model.fields.find(
      (f) =>
        (f.kind === 'scalar' || f.kind === 'enum') &&
        !f.isId &&
        !f.isUpdatedAt &&
        !keys.has(f.name) &&
        !(unique?.fields.includes(f.name) ?? false) &&
        sampleOf(f, datamodel.enums) !== null,
    )
    const updateEntries = updated === undefined ? null : entriesOf([updated], datamodel.enums)
    const update = updateEntries === null ? null : objectOf(updateEntries)
    return [
      example('findMany', 'Every row', `await ${client}.findMany()`, 'findMany', {
        arguments: {},
        selection: SCALARS,
      }),
      example('count', 'How many rows there are', `await ${client}.count()`, 'aggregate', {
        arguments: {},
        selection: { _count: { arguments: {}, selection: { _all: true } } },
      }),
      ...(relations.length === 0
        ? []
        : [
            example(
              'findMany',
              'Every row with its relations',
              `await ${client}.findMany({ include: ${include.code} })`,
              'findMany',
              {
                arguments: {},
                selection: {
                  ...SCALARS,
                  ...Object.fromEntries(
                    relations.map((f) => [f.name, { arguments: {}, selection: SCALARS }]),
                  ),
                },
              },
            ),
          ]),
      ...(where === null
        ? []
        : [
            example(
              'findUnique',
              'One row by what is unique to it',
              `await ${client}.findUnique({ where: ${where.code} })`,
              'findUnique',
              { arguments: { where: where.json }, selection: SCALARS },
            ),
          ]),
      ...(create === null
        ? []
        : [
            example(
              'create',
              'Create a row',
              `await ${client}.create({ data: ${create.code} })`,
              'createOne',
              { arguments: { data: create.json }, selection: SCALARS },
            ),
          ]),
      ...(where === null || update === null
        ? []
        : [
            example(
              'update',
              'Update a row',
              `await ${client}.update({ where: ${where.code}, data: ${update.code} })`,
              'updateOne',
              { arguments: { where: where.json, data: update.json }, selection: SCALARS },
            ),
          ]),
      ...(where === null
        ? []
        : [
            example(
              'delete',
              'Delete a row',
              `await ${client}.delete({ where: ${where.code} })`,
              'deleteOne',
              { arguments: { where: where.json }, selection: SCALARS },
            ),
          ]),
    ].filter((query) => actions.has(query.request.action))
  })
}

const Fragment = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('stringChunk').meta({ description: 'Text of the statement.' }),
      chunk: z.string().meta({ description: 'The text.', example: 'SELECT "id" FROM "User"' }),
    }),
    z.object({
      type: z.literal('parameter').meta({ description: 'One value bound.' }),
    }),
    z.object({
      type: z.literal('parameterTuple').meta({ description: 'A list bound item by item.' }),
      itemPrefix: z.string().optional().meta({ description: 'Before each item.', example: '' }),
      itemSeparator: z.string().optional().meta({ description: 'Between items.', example: ',' }),
      itemSuffix: z.string().optional().meta({ description: 'After each item.', example: '' }),
    }),
    z.object({
      type: z.literal('parameterTupleList').meta({ description: 'Lists bound row by row.' }),
      itemPrefix: z.string().meta({ description: 'Before each item.', example: '' }),
      itemSeparator: z.string().meta({ description: 'Between items.', example: ',' }),
      itemSuffix: z.string().meta({ description: 'After each item.', example: '' }),
      groupSeparator: z.string().meta({ description: 'Between rows.', example: ',' }),
    }),
  ])
  .meta({ description: 'A piece of a planned statement: text, or where a value is bound' })

const TemplateSql = z
  .object({
    type: z.literal('templateSql').meta({ description: 'A statement made of fragments.' }),
    fragments: z.array(Fragment).meta({ description: 'The statement, piece by piece.' }),
    args: z
      .array(z.unknown())
      .meta({ description: 'A value for each fragment that binds one.', example: ['0'] }),
    placeholderFormat: z
      .object({
        prefix: z.string().meta({ description: 'What a placeholder starts with.', example: '$' }),
        hasNumbering: z
          .boolean()
          .meta({ description: 'Whether placeholders are numbered.', example: true }),
      })
      .meta({ description: 'How the database writes a placeholder.' }),
  })
  .meta({ description: 'A statement of a query plan, its values bound where the fragments say' })

const RawSql = z
  .object({
    type: z.literal('rawSql').meta({ description: 'A statement written out whole.' }),
    sql: z.string().meta({ description: 'The statement.', example: 'SELECT 1' }),
    args: z.array(z.unknown()).meta({ description: 'The values bound.', example: [] }),
  })
  .meta({ description: 'A statement of a query plan written out whole' })

const PlanReference = z
  .object({
    prisma__type: z.literal('param').meta({ description: 'Marks a value read from a result.' }),
    prisma__value: z
      .object({
        name: z
          .string()
          .meta({ description: 'The result and field it is read from.', example: '@parent$id' }),
      })
      .meta({ description: 'Where the value is read from.' }),
  })
  .meta({ description: 'A value the plan takes from what a statement before it returned' })

const Values = z
  .array(z.unknown())
  .meta({ description: 'A list of values a fragment binds', example: ['1', '2'] })

const GeneratedBinding = z
  .object({
    name: z
      .string()
      .meta({ description: 'What the plan calls the value.', example: '@generated$row0$id' }),
    expr: z
      .object({
        type: z.literal('value').meta({ description: 'A value the plan makes itself.' }),
        args: z
          .object({
            prisma__type: z
              .literal('generatorCall')
              .meta({ description: 'Marks a default the client computes.' }),
            prisma__value: z
              .object({
                name: z.string().meta({ description: 'The function.', example: 'uuid' }),
                args: z.array(z.unknown()).meta({ description: 'Its arguments.', example: [4] }),
              })
              .meta({ description: 'The call.' }),
          })
          .meta({ description: 'The default to compute.' }),
      })
      .meta({ description: 'How the value is made.' }),
  })
  .meta({ description: 'A value the plan computes before its statements: `uuid(4)`, `now()`' })

// The defaults the client computes before it writes (`@default(uuid(4))`), by the name the plan
// binds each to, written as the schema writes them.
function generatedValues(plan: unknown): readonly (readonly [string, string])[] {
  const list = Values.safeParse(plan)
  if (list.success) return list.data.flatMap(generatedValues)
  if (typeof plan !== 'object' || plan === null) return []
  const binding = GeneratedBinding.safeParse(plan)
  const call = binding.success ? binding.data.expr.args.prisma__value : null
  return [
    ...(binding.success && call !== null
      ? [[binding.data.name, `${call.name}(${call.args.map(String).join(', ')})`] as const]
      : []),
    ...Object.values(plan).flatMap(generatedValues),
  ]
}

// A value the plan binds as it runs: a default it computes (`<uuid(4)>`), or one read from what a
// statement before it returned (`@parent$id`), named by the field it is read from.
function paramOf(value: unknown, generated: ReadonlyMap<string, string>) {
  const result = PlanReference.safeParse(value)
  if (!result.success) return value
  const { name } = result.data.prisma__value
  const call = generated.get(name)
  return call === undefined ? `<${name.split('$').at(-1) ?? name} of the rows above>` : `<${call}>`
}

function renderTemplate(
  template: z.infer<typeof TemplateSql>,
  generated: ReadonlyMap<string, string>,
): PlannedStatement {
  const { prefix, hasNumbering } = template.placeholderFormat
  // What each fragment binds, as rows of values: none for text, one row of one for a value, one
  // row for a list (one taken from a statement before it is of no known length, and shown as
  // one), a row each for a list of lists.
  const bound = template.fragments.map((fragment, i) => {
    if (fragment.type === 'stringChunk') return []
    const value =
      template.args[template.fragments.slice(0, i).filter((f) => f.type !== 'stringChunk').length]
    const list = Values.safeParse(value)
    const items = list.success ? list.data : [value]
    if (fragment.type === 'parameter') return [[value]]
    if (fragment.type === 'parameterTuple') return [items]
    return items.map((group) => {
      const row = Values.safeParse(group)
      return row.success ? row.data : [group]
    })
  })
  // Every value in the order it is bound, and how many are bound before each fragment.
  const values = bound.flatMap((rows) => rows.flat())
  const counts = bound.map((rows) => rows.flat().length)
  // Placeholders are numbered from 1 in the order they are written, where the database numbers them.
  const placeholder = (count: number) => (hasNumbering ? `${prefix}${count}` : prefix)
  const sql = template.fragments.map((fragment, i) => {
    const rows = bound[i] ?? []
    const before = counts.slice(0, i).reduce((sum, count) => sum + count, 0)
    if (fragment.type === 'stringChunk') return fragment.chunk
    if (fragment.type === 'parameter') return placeholder(before + 1)
    const starts = rows.map((_, r) => before + rows.slice(0, r).flat().length)
    const written = rows.map(
      (row, r) =>
        `(${row.map((_, j) => `${fragment.itemPrefix ?? ''}${placeholder((starts[r] ?? 0) + j + 1)}${fragment.itemSuffix ?? ''}`).join(fragment.itemSeparator ?? ',')})`,
    )
    return written.join(fragment.type === 'parameterTupleList' ? fragment.groupSeparator : '')
  })
  return { sql: sql.join(''), params: values.map((value) => paramOf(value, generated)) }
}

/**
 * The statements a query plan runs, in the order it holds them, each with its placeholders as the
 * database writes them (`$1` on PostgreSQL, `?` on MySQL and SQLite) and the values bound to them.
 * A default the client computes is written as the schema writes it (`<uuid(4)>`), and a value
 * taken from what a statement before it returned is named by the field it is read from.
 *
 * @param plan - what the query compiler returned for one request
 * @returns the statements
 * @example
 * For `prisma.user.findMany({ include: { posts: true } })` on PostgreSQL:
 * ```sql
 * SELECT "public"."User"."id", "public"."User"."email" FROM "public"."User" WHERE 1=1 OFFSET $1
 * -- params: ["0"]
 * SELECT "public"."Post"."id", "public"."Post"."title", "public"."Post"."authorId" FROM "public"."Post" WHERE "public"."Post"."authorId" IN ($1) OFFSET $2
 * -- params: ["<id of the rows above>","0"]
 * ```
 */
export function planStatements(plan: unknown): readonly PlannedStatement[] {
  const generated = new Map(generatedValues(plan))
  const walk = (node: unknown): readonly PlannedStatement[] => {
    const list = Values.safeParse(node)
    if (list.success) return list.data.flatMap(walk)
    if (typeof node !== 'object' || node === null) return []
    const template = TemplateSql.safeParse(node)
    if (template.success) return [renderTemplate(template.data, generated)]
    const raw = RawSql.safeParse(node)
    if (raw.success) {
      return [
        { sql: raw.data.sql, params: raw.data.args.map((value) => paramOf(value, generated)) },
      ]
    }
    return Object.values(node).flatMap(walk)
  }
  return walk(plan)
}
