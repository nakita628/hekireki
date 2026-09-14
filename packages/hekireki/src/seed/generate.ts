import type { Faker } from '@faker-js/faker'
import type { DMMF } from '@prisma/generator-helper'
import { Effect } from 'effect'

import type { LooseModelRule, ResolvedSeedConfig, SeedRow, SeedValue } from './config.js'
import { SeedGenerationError } from './errors.js'
import type { ForeignKey, JoinSide, JoinTable, ModelTable, SeedColumn, SeedTable } from './plan.js'
import { fieldDefault } from './plan.js'
import { validateRows } from './validate.js'
import { dateBetween, generatedDefault, makeFieldValue } from './values.js'

export type SeedTableRows = { readonly table: SeedTable; readonly rows: readonly SeedRow[] }

const MAX_ATTEMPTS = 20

/** A stable text form of a value, so unique constraints can be checked through a Set. */
function keyOf(value: SeedValue): string {
  if (value === null) return 'null'
  if (typeof value === 'bigint') return `${value.toString()}n`
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex')
  if (Array.isArray(value)) return JSON.stringify(value.map(keyOf))
  if (typeof value === 'object') {
    return JSON.stringify(Object.entries(value).map(([k, v]) => [k, keyOf(v)]))
  }
  return JSON.stringify(value)
}

function uniqueKey(row: SeedRow, fields: readonly string[]) {
  return fields.map((field) => keyOf(row[field] ?? null)).join(' ')
}

/** What is wrong with the rules for one model, as sentences; nothing when they fit the schema. */
function isKeyObject(value: SeedValue | undefined): value is SeedRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Uint8Array)
  )
}

function modelTable(tables: readonly SeedTable[], name: string) {
  return tables.find((t): t is ModelTable => t.kind === 'model' && t.name === name)
}

/** The field of the child model that owns the key back to this relation field's model. */
function inverseOwner(tables: readonly SeedTable[], table: ModelTable, field: DMMF.Field) {
  return modelTable(tables, field.type)?.model.fields.find(
    (f) =>
      f.kind === 'object' &&
      f.relationName === field.relationName &&
      f.type === table.name &&
      (f.relationFromFields ?? []).length > 0,
  )
}

/** Whether the field is the other side of a key another model owns: a one-to-many or one-to-one parent side. */
function isParentSide(tables: readonly SeedTable[], table: ModelTable, name: string) {
  const field = table.model.fields.find((f) => f.name === name)
  return (
    field?.kind === 'object' &&
    (field.relationFromFields ?? []).length === 0 &&
    inverseOwner(tables, table, field) !== undefined
  )
}

function isLinkField(tables: readonly SeedTable[], model: string, field: string) {
  return tables.some(
    (t) => t.kind === 'join' && t.sides.some((s) => s.model === model && s.field === field),
  )
}

/** What is wrong in one real row and the rows nested in it, as sentences. */
function checkDataRow(
  tables: readonly SeedTable[],
  table: ModelTable,
  row: SeedRow,
  where: string,
): readonly string[] {
  return Object.entries(row).flatMap(([name, value]) => {
    const field = table.model.fields.find((f) => f.name === name)
    if (field === undefined) {
      return [`${where}.${name}: ${table.name} has no field named ${name}.`]
    }
    if (field.kind !== 'object') return []
    if ((field.relationFromFields ?? []).length > 0) {
      return isKeyObject(value)
        ? []
        : [
            `${where}.${name}: name the ${field.type} row by a unique key, \`{ id }\` or \`{ email }\`, or give ${(field.relationFromFields ?? []).join(', ')}.`,
          ]
    }
    if (isLinkField(tables, table.name, name)) {
      return isSeedList(value) || value === null
        ? []
        : [`${where}.${name}: expected a list of ${field.type} ids or keys.`]
    }
    const owner = inverseOwner(tables, table, field)
    const child = modelTable(tables, field.type)
    if (owner === undefined || child === undefined) {
      return [`${where}.${name}: ${table.name}.${name} cannot be written in a row.`]
    }
    const nested = isSeedList(value) ? value : [value]
    return nested.flatMap((item, i) =>
      isKeyObject(item)
        ? checkDataRow(
            tables,
            child,
            item,
            field.isList ? `${where}.${name}[${i}]` : `${where}.${name}`,
          )
        : [`${where}.${name}: expected ${field.isList ? 'rows' : 'a row'} of ${field.type}.`],
    )
  })
}

/** What is wrong with the rules for one model, as sentences; nothing when they fit the schema. */
function checkModel(name: string, rule: LooseModelRule, tables: readonly SeedTable[]) {
  const table = modelTable(tables, name)
  if (table === undefined) return [`models.${name}: no model named ${name} in the schema.`]
  const isColumn = (field: string) =>
    table.model.fields.some((f) => f.name === field && f.kind !== 'object')
  const fields = Object.keys(rule.fields ?? {}).flatMap((field) =>
    isColumn(field)
      ? []
      : [`models.${name}.fields.${field}: ${name} has no scalar field named ${field}.`],
  )
  const data = (rule.data ?? []).flatMap((row, index) =>
    checkDataRow(tables, table, row, `models.${name}.data[${index}]`),
  )
  const relations = Object.keys(rule.relations ?? {}).flatMap((field) =>
    isLinkField(tables, name, field) || isParentSide(tables, table, field)
      ? []
      : [
          `models.${name}.relations.${field}: ${name} has no relation field named ${field} that a rule can bound (a list, or the other side of a key).`,
        ],
  )
  const count =
    rule.count !== undefined && (!Number.isInteger(rule.count) || rule.count < 0)
      ? [`models.${name}.count: expected a non-negative integer, got ${String(rule.count)}.`]
      : []
  const exclusive =
    rule.data !== undefined && (rule.count !== undefined || rule.fields !== undefined)
      ? [
          `models.${name}: \`data\` and \`count\` / \`fields\` are exclusive. Give the real rows in \`data\`, or let faker make them with \`count\` and \`fields\`, not both.`,
        ]
      : []
  return [...fields, ...data, ...relations, ...count, ...exclusive]
}

function checkRules(tables: readonly SeedTable[], config: ResolvedSeedConfig) {
  return Effect.gen(function* () {
    const problems = Object.entries(config.models).flatMap(([name, rule]) =>
      checkModel(name, rule, tables),
    )
    if (problems.length > 0) yield* new SeedGenerationError({ message: problems.join('\n   ') })
  })
}

function describeValue(value: SeedValue) {
  if (typeof value === 'bigint') return `${value.toString()}n`
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Uint8Array) return `<${value.length} bytes>`
  return JSON.stringify(value)
}

/**
 * A given scalar as the column stores it, when the value can be read that way: an ISO string
 * becomes a Date, an integer a bigint, a number a decimal string, base64 text bytes. Anything else
 * is left as it is for validation to report.
 */
function normalizeScalar(field: DMMF.Field, value: SeedValue) {
  switch (field.type) {
    case 'DateTime': {
      if (typeof value !== 'string') return value
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? value : date
    }
    case 'BigInt':
      if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value)
      return typeof value === 'string' && /^-?\d+$/u.test(value) ? BigInt(value) : value
    case 'Decimal':
      return typeof value === 'number' && Number.isFinite(value) ? String(value) : value
    case 'Bytes':
      return typeof value === 'string' ? Uint8Array.from(Buffer.from(value, 'base64')) : value
    default:
      return value
  }
}

function isSeedList(value: SeedValue): value is readonly SeedValue[] {
  return Array.isArray(value)
}

function normalizeValue(field: DMMF.Field, value: SeedValue) {
  if (value === null || field.kind === 'enum') return value
  if (field.isList) {
    return isSeedList(value) ? value.map((item) => normalizeScalar(field, item)) : value
  }
  return normalizeScalar(field, value)
}

type Context = {
  readonly faker: Faker
  readonly config: ResolvedSeedConfig
  readonly tables: readonly SeedTable[]
  readonly rowsByModel: ReadonlyMap<string, readonly SeedRow[]>
  /** Real rows nested under a parent, per child model, their key to the parent already filled. */
  readonly pending: Map<string, SeedRow[]>
  /** The real rows each model's rows were made from, by index, for the join tables to read their links. */
  readonly givenByModel: Map<string, readonly SeedRow[]>
  /** Per foreign key (`Post.author`), how many rows already point at each parent, by the parent's key. */
  readonly linkCounts: Map<string, Map<string, number>>
}

type RowInput = {
  readonly context: Context
  readonly table: ModelTable
  readonly index: number
  readonly own: readonly SeedRow[]
  /** The given row to complete, when this index is one of `rows`. */
  readonly given: SeedRow | null
  /** Per one-to-one key, the parents not claimed by a given row, in the order they are handed out. */
  readonly pools: ReadonlyMap<string, readonly SeedRow[]>
  /** Per one-to-one key, which parent of the pool this row takes. */
  readonly slots: ReadonlyMap<string, number>
}

function specifies(given: SeedRow | null, fk: ForeignKey) {
  return given !== null && fk.fromFields.every((field) => field in given)
}

/** The parent the given key values name; fails when no such row exists. */
function findParent(input: RowInput, fk: ForeignKey, given: SeedRow) {
  return Effect.gen(function* () {
    const { context, table, index, own } = input
    const parents = fk.self ? own : (context.rowsByModel.get(fk.toModel) ?? [])
    const wanted = fk.fromFields.map((field) => given[field] ?? null)
    if (wanted.every((value) => value === null)) {
      if (!fk.required) return null
      return yield* new SeedGenerationError({
        message: `${table.name} data[${index}].${fk.field}: the relation is required, but ${fk.fromFields.join(', ')} is null.`,
      })
    }
    const key = wanted.map(keyOf).join(' ')
    const parent = parents.find((row) => uniqueKey(row, fk.toFields) === key)
    if (parent !== undefined) return parent
    return yield* new SeedGenerationError({
      message: `${table.name} data[${index}].${fk.field}: no ${fk.toModel} has ${fk.toFields.join(', ')} = ${wanted.map(describeValue).join(', ')}.\n   Give ${fk.toModel} that row, or let the seeder pick one.`,
    })
  })
}

/** The one parent a unique key names (`{ email: '...' }`); fails when none or several do. */
function findParentByKey(input: RowInput, fk: ForeignKey, key: SeedRow) {
  return Effect.gen(function* () {
    const { context, table, index, own } = input
    const parents = fk.self ? own : (context.rowsByModel.get(fk.toModel) ?? [])
    const wanted = Object.entries(key)
    const matches = parents.filter((row) =>
      wanted.every(([field, value]) => keyOf(row[field] ?? null) === keyOf(value)),
    )
    const shown = wanted.map(([field, value]) => `${field} = ${describeValue(value)}`).join(', ')
    if (matches.length === 1) return matches[0] ?? null
    return yield* new SeedGenerationError({
      message:
        matches.length === 0
          ? `${table.name} data[${index}].${fk.field}: no ${fk.toModel} has ${shown}.\n   Give ${fk.toModel} that row.`
          : `${table.name} data[${index}].${fk.field}: ${matches.length} ${fk.toModel} rows have ${shown}; name the row by a unique key.`,
    })
  })
}

/**
 * The parent row a foreign key of the row points at, or null for an optional key left empty. A
 * real row names its parent by the key scalars or by a unique key; a required key it leaves out
 * is linked to a row that exists, like a faker row's.
 */
function pickParent(input: RowInput, fk: ForeignKey, self: SeedRow) {
  return Effect.gen(function* () {
    const { context, table, own, pools, slots } = input
    if (input.given !== null) {
      const reference = input.given[fk.field]
      if (isKeyObject(reference)) return yield* findParentByKey(input, fk, reference)
      if (specifies(input.given, fk)) return yield* findParent(input, fk, input.given)
      if (!fk.required) return null
    }
    const parents = fk.self ? own : (context.rowsByModel.get(fk.toModel) ?? [])
    if (fk.oneToOne && !fk.self) {
      const parent = pools.get(fk.field)?.[slots.get(fk.field) ?? 0]
      if (parent !== undefined) return parent
      if (!fk.required) return null
      return yield* new SeedGenerationError({
        message: `${table.name}.${fk.field} is a one-to-one relation to ${fk.toModel}, so at most ${parents.length} ${table.name} rows can be seeded (${fk.toModel} has ${parents.length}).`,
      })
    }
    const bound = parentBound(context, table, fk)
    const counted = (parent: SeedRow) =>
      context.linkCounts.get(`${table.name}.${fk.field}`)?.get(uniqueKey(parent, fk.toFields)) ?? 0
    // Parents still under the rule's `min` come first, so every one of them is served; none above
    // its `max` is offered at all.
    const open = parents.filter((parent) => bound.max === null || counted(parent) < bound.max)
    const behind = open.filter((parent) => bound.min !== null && counted(parent) < bound.min)
    // The parents furthest from their `min` come first, so the rows are spread before any is spent.
    const fewest = Math.min(...behind.map(counted))
    const short = behind.filter((parent) => counted(parent) === fewest)
    const nullRate = context.config.nullRate ?? 0
    if (
      !fk.required &&
      short.length === 0 &&
      nullRate > 0 &&
      context.faker.datatype.boolean({ probability: nullRate })
    ) {
      return null
    }
    if (short.length > 0) return context.faker.helpers.arrayElement(short)
    if (open.length > 0) return context.faker.helpers.arrayElement(open)
    if (parents.length > 0 && bound.max !== null) {
      return yield* new SeedGenerationError({
        message: `${table.name}.${fk.field}: every ${fk.toModel} already has ${bound.max} ${table.name} rows (models.${fk.toModel}.relations.${bound.field ?? ''}.max).\n   Lower models.${table.name}.count or raise the max.`,
      })
    }
    if (fk.self) return fk.required ? self : null
    if (!fk.required) return null
    return yield* new SeedGenerationError({
      message: `${table.name}.${fk.field} requires a ${fk.toModel} row, but ${fk.toModel} has none. Give ${fk.toModel} a count.`,
    })
  })
}

/**
 * What a real row gets for a column it leaves out: the `@default` (a literal as written, a
 * function as the library makes it, autoincrement as the next number), an `@updatedAt` stamp,
 * or null when the field is optional. A required field with no default has to be given.
 */
function defaultValue(input: RowInput, field: DMMF.Field) {
  return Effect.gen(function* () {
    const { context, table, index } = input
    const bounds = { nullRate: 0, dates: context.config.dates }
    const generated = fieldDefault(field)
    if (generated?.name === 'autoincrement') {
      return field.type === 'BigInt' ? BigInt(index + 1) : index + 1
    }
    const made = generatedDefault(context.faker, field, {}, bounds)
    if (made !== null) return made
    if (field.hasDefaultValue && generated === null && field.default !== undefined) {
      return normalizeValue(field, isScalarList(field.default) ? [...field.default] : field.default)
    }
    if (field.isUpdatedAt === true) return dateBetween(context.faker, {}, bounds)
    if (!field.isRequired) return null
    if (field.isList) return []
    return yield* new SeedGenerationError({
      message: `${table.name} data[${index}].${field.name}: the field is required and has no default, so the row must give it.`,
    })
  })
}

/** The scalar columns in declaration order, each generated with the row so far in view. */
function fillScalars(
  input: RowInput,
  columns: readonly SeedColumn[],
  skip: ReadonlySet<string>,
  row: SeedRow,
): SeedRow {
  const [column, ...rest] = columns
  if (column === undefined) return row
  const field = input.table.model.fields.find((f) => f.name === column.field)
  if (skip.has(column.field) || field === undefined) return fillScalars(input, rest, skip, row)
  const value = makeFieldValue({
    faker: input.context.faker,
    field,
    enumValues: column.enumValues,
    rule: input.context.config.models[input.table.name]?.fields?.[column.field],
    bounds: { nullRate: input.context.config.nullRate, dates: input.context.config.dates },
    index: input.index,
    row,
  })
  return fillScalars(input, rest, skip, { ...row, [column.field]: value })
}

function isScalarList(
  value: DMMF.Field['default'],
): value is readonly (string | number | boolean)[] {
  return Array.isArray(value)
}

/** One omitted column of a real row with its default, as a `[field, value]` entry. */
function defaultEntry(input: RowInput, column: SeedColumn) {
  return Effect.gen(function* () {
    const field = input.table.model.fields.find((f) => f.name === column.field)
    const value = field === undefined ? null : yield* defaultValue(input, field)
    return [column.field, value] as const
  })
}

/** The columns a real row leaves out, each filled with its default. */
function fillDefaults(input: RowInput, skip: ReadonlySet<string>, row: SeedRow) {
  return Effect.gen(function* () {
    const entries = yield* Effect.forEach(
      input.table.columns.filter((column) => !skip.has(column.field)),
      (column) => defaultEntry(input, column),
    )
    const filled: SeedRow = { ...row, ...Object.fromEntries(entries) }
    return filled
  })
}

/** The given values of the row, each read as its column stores them. */
function normalizeGiven(input: RowInput) {
  const { given, table } = input
  if (given === null) return {}
  const fitted: SeedRow = Object.fromEntries(
    table.columns
      .filter((column) => column.field in given)
      .map((column) => {
        const field = table.model.fields.find((f) => f.name === column.field)
        const value = given[column.field] ?? null
        return [column.field, field === undefined ? value : normalizeValue(field, value)]
      }),
  )
  return fitted
}

function makeRow(input: RowInput) {
  return Effect.gen(function* () {
    const { context, table, given } = input
    const rules = context.config.models[table.name]?.fields ?? {}
    const fitted = normalizeGiven(input)
    // A faker row gets every key picked unless a rule fills its scalars; a real row's keys are
    // read from what it gives, or picked when it gives nothing for a required one.
    const keys = table.foreignKeys.filter(
      (fk) => given !== null || rules[fk.fromFields[0] ?? ''] === undefined,
    )
    const skip = new Set([...Object.keys(fitted), ...keys.flatMap((fk) => fk.fromFields)])
    const scalars =
      given === null
        ? fillScalars(input, table.columns, skip, fitted)
        : yield* fillDefaults(input, skip, fitted)
    const parents = yield* Effect.forEach(keys, (fk) => pickParent(input, fk, scalars))
    const linked: SeedRow = {
      ...scalars,
      ...Object.fromEntries(
        keys.flatMap((fk, k) =>
          fk.fromFields.map((from, i) => {
            const parent = parents[k] ?? null
            return [from, parent === null ? null : (parent[fk.toFields[i] ?? ''] ?? null)]
          }),
        ),
      ),
    }
    // A row is updated at or after it was created: @updatedAt follows the latest now() default.
    const created = table.model.fields
      .filter((f) => f.type === 'DateTime' && !f.isUpdatedAt && fieldDefault(f)?.name === 'now')
      .map((f) => linked[f.name])
      .filter((v): v is Date => v instanceof Date)
      .toSorted((a, b) => b.getTime() - a.getTime())[0]
    const updated = table.model.fields
      .filter(
        (f) =>
          f.isUpdatedAt === true &&
          rules[f.name] === undefined &&
          !(f.name in fitted) &&
          created !== undefined,
      )
      .map((f) => {
        const end =
          context.config.dates?.to ?? new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000)
        const to = end > created ? end : created
        return [f.name, context.faker.date.between({ from: created, to })] as const
      })
    const row: SeedRow = { ...linked, ...Object.fromEntries(updated) }
    return row
  })
}

function violated(row: SeedRow, table: ModelTable, seen: ReadonlyMap<string, ReadonlySet<string>>) {
  return table.uniques.filter((fields) => seen.get(fields.join(' '))?.has(uniqueKey(row, fields)))
}

/**
 * A string field that collided gets the row number worked in, so an email stays an email. A
 * foreign key column is left alone: its value is a parent's, and changing it would break the
 * relation the constraint sits on.
 */
function disambiguate(row: SeedRow, fields: readonly string[], table: ModelTable, index: number) {
  const keys = new Set(table.foreignKeys.flatMap((fk) => fk.fromFields))
  return fields.flatMap((field): readonly (readonly [string, string])[] => {
    const value = row[field]
    const declared = table.model.fields.find((f) => f.name === field)
    if (keys.has(field) || typeof value !== 'string' || declared?.type !== 'String') return []
    const at = value.indexOf('@')
    const suffix = String(index + 1)
    return [
      [field, at > 0 ? `${value.slice(0, at)}${suffix}${value.slice(at)}` : `${value}-${suffix}`],
    ]
  })
}

/**
 * Rows until one meets every unique constraint; the last attempt is patched by hand. A given
 * row is taken as written, so a clash in it is reported, not worked around.
 */
function attemptRow(input: RowInput, seen: ReadonlyMap<string, ReadonlySet<string>>) {
  return Effect.gen(function* () {
    if (input.given !== null) {
      const row = yield* makeRow(input)
      const clash = violated(row, input.table, seen)[0]
      if (clash === undefined) return row
      return yield* new SeedGenerationError({
        message: `${input.table.name} data[${input.index}]: ${clash.join(', ')} = ${clash.map((field) => describeValue(row[field] ?? null)).join(', ')} repeats an earlier row.`,
      })
    }
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
      const made = yield* makeRow(input)
      if (violated(made, input.table, seen).length === 0) return made
    }
    const last = yield* makeRow(input)
    const patches = violated(last, input.table, seen).flatMap((fields) =>
      disambiguate(last, fields, input.table, input.index),
    )
    const fixed: SeedRow = Object.fromEntries([...Object.entries(last), ...patches])
    const remaining = violated(fixed, input.table, seen)
    if (remaining.length === 0) return fixed
    return yield* new SeedGenerationError({
      message: `${input.table.name}: cannot satisfy the unique constraint on ${remaining[0]?.join(', ') ?? ''} for ${input.own.length + 1} or more rows.\n   Lower models.${input.table.name}.count or widen the field's range.`,
    })
  })
}

/** The rule the parent model sets on the list or single field this key is the other side of. */
function parentBound(context: Context, table: ModelTable, fk: ForeignKey) {
  const own = table.model.fields.find((f) => f.name === fk.field)
  const parent = modelTable(context.tables, fk.toModel)
  const inverse = parent?.model.fields.find(
    (f) =>
      f.kind === 'object' &&
      f.relationName === own?.relationName &&
      f.type === table.name &&
      (f.relationFromFields ?? []).length === 0,
  )
  const rule =
    inverse === undefined ? undefined : context.config.models[fk.toModel]?.relations?.[inverse.name]
  return { field: inverse?.name ?? null, min: rule?.min ?? null, max: rule?.max ?? null }
}

/** `User[1] { email: "bob@example.com" }`: the row by index and by the key that says most about it. */
function labelOf(table: ModelTable, index: number, row: SeedRow) {
  const ids = new Set(table.model.fields.filter((f) => f.isId).map((f) => f.name))
  const key = [...table.uniques]
    .toSorted((a, b) => Number(a.some((f) => ids.has(f))) - Number(b.some((f) => ids.has(f))))
    .find((fields) => fields.every((field) => row[field] !== undefined && row[field] !== null))
  const shown =
    key === undefined
      ? ''
      : ` { ${key.map((field) => `${field}: ${describeValue(row[field] ?? null)}`).join(', ')} }`
  return `${table.name}[${index}]${shown}`
}

/** How many rows of the relation each row of the table has, by the table row's index. */
function relatedCounts(
  context: Context,
  table: ModelTable,
  field: DMMF.Field,
  rows: readonly SeedRow[],
) {
  const join = context.tables.find(
    (t): t is JoinTable =>
      t.kind === 'join' &&
      t.sides.some((side) => side.model === table.name && side.field === field.name),
  )
  if (join !== undefined) {
    const side = join.sides.find((s) => s.model === table.name && s.field === field.name)
    const pairs = context.rowsByModel.get(join.name) ?? []
    return rows.map((row) =>
      side === undefined
        ? 0
        : pairs.filter(
            (pair) => keyOf(pair[side.column] ?? null) === keyOf(row[side.idField] ?? null),
          ).length,
    )
  }
  const owner = inverseOwner(context.tables, table, field)
  const children = context.rowsByModel.get(field.type) ?? []
  if (owner === undefined) return rows.map(() => 0)
  const from = owner.relationFromFields ?? []
  const to = owner.relationToFields ?? []
  return rows.map(
    (row) =>
      children.filter((child) =>
        from.every((f, i) => keyOf(child[f] ?? null) === keyOf(row[to[i] ?? ''] ?? null)),
      ).length,
  )
}

/** Every relation rule against the rows made: each row must have between `min` and `max` related rows. */
function checkCardinality(context: Context) {
  return Effect.gen(function* () {
    const problems = Object.entries(context.config.models).flatMap(([name, rule]) => {
      const table = modelTable(context.tables, name)
      const rows = context.rowsByModel.get(name) ?? []
      if (table === undefined) return []
      return Object.entries(rule.relations ?? {}).flatMap(([fieldName, bound]) => {
        const field = table.model.fields.find((f) => f.name === fieldName)
        if (field === undefined) return []
        const counts = relatedCounts(context, table, field, rows)
        return counts.flatMap((count, index) => {
          const row = rows[index]
          if (row === undefined) return []
          const where = `${labelOf(table, index, row)}.${fieldName}: ${count} row${count === 1 ? '' : 's'}`
          if (bound.min !== undefined && count < bound.min) {
            return [
              `${where}, at least ${bound.min} expected (models.${name}.relations.${fieldName}.min)`,
            ]
          }
          if (bound.max !== undefined && count > bound.max) {
            return [
              `${where}, at most ${bound.max} expected (models.${name}.relations.${fieldName}.max)`,
            ]
          }
          return []
        })
      })
    })
    if (problems.length > 0) {
      const shown = problems.slice(0, 20)
      const more = problems.length - shown.length
      yield* new SeedGenerationError({
        message: `Relations out of bounds, nothing was inserted.\n   ${shown.join('\n   ')}${more > 0 ? `\n   ... and ${more} more` : ''}`,
      })
    }
  })
}

/** How a real row claims a parent of a one-to-one key: by scalars, by unique key, or not at all. */
function claimOf(fk: ForeignKey, given: SeedRow, parents: readonly SeedRow[]) {
  const reference = given[fk.field]
  if (isKeyObject(reference)) {
    const wanted = Object.entries(reference)
    const parent = parents.find((row) =>
      wanted.every(([field, value]) => keyOf(row[field] ?? null) === keyOf(value)),
    )
    return parent === undefined ? null : uniqueKey(parent, fk.toFields)
  }
  return specifies(given, fk)
    ? fk.fromFields.map((field) => keyOf(given[field] ?? null)).join(' ')
    : null
}

/** Queues the rows nested under one parent-side field, each with its key to the parent filled. */
function nestField(
  context: Context,
  table: ModelTable,
  field: DMMF.Field,
  given: SeedRow,
  row: SeedRow,
) {
  return Effect.gen(function* () {
    const owner = inverseOwner(context.tables, table, field)
    const nested = given[field.name]
    if (owner === undefined || nested === undefined || nested === null) return
    const children = isSeedList(nested) ? nested : [nested]
    const link = Object.fromEntries(
      (owner.relationFromFields ?? []).map((from, i) => [
        from,
        row[owner.relationToFields?.[i] ?? ''] ?? null,
      ]),
    )
    const queue = context.pending.get(field.type) ?? []
    context.pending.set(field.type, queue)
    for (const child of children) {
      if (!isKeyObject(child)) {
        yield* new SeedGenerationError({
          message: `${table.name}.${field.name}: expected rows of ${field.type}, got ${describeValue(child)}.`,
        })
      } else if (owner.name in child || Object.keys(link).some((from) => from in child)) {
        // The nesting already says which parent this is; a second answer could only disagree.
        yield* new SeedGenerationError({
          message: `${table.name}.${field.name}: a nested ${field.type} row already points at its ${table.name} through ${owner.name}; leave out ${owner.name} and ${Object.keys(link).join(', ')}.`,
        })
      } else {
        // oxlint-disable-next-line custom/no-mutation -- the queue is consumed by the child model's loop
        queue.push({ ...child, ...link })
      }
    }
  })
}

/**
 * The rows nested under a real row, each with its key to the parent filled from the parent as it
 * was made; queued for the child model, or for this model itself under a self relation.
 */
function nestChildren(context: Context, table: ModelTable, given: SeedRow, row: SeedRow) {
  return Effect.forEach(
    table.model.fields.filter(
      (field) => field.kind === 'object' && (field.relationFromFields ?? []).length === 0,
    ),
    (field) => nestField(context, table, field, given, row),
    { discard: true },
  )
}

function makeModelRows(context: Context, table: ModelTable) {
  return Effect.gen(function* () {
    const rule = context.config.models[table.name]
    // The real rows: the model's own, then the ones nested under parents made before it. A self
    // relation nests rows into this very queue while it is being walked.
    const queue: SeedRow[] = [...(rule?.data ?? []), ...(context.pending.get(table.name) ?? [])]
    context.pending.set(table.name, queue)
    const oneToOne = table.foreignKeys.filter((fk) => fk.oneToOne && !fk.self)
    const parentCounts = oneToOne
      .filter((fk) => fk.required)
      .map((fk) => (context.rowsByModel.get(fk.toModel) ?? []).length)
    // Faker rows come after the real ones: as many as the rule says, or the config's count for a
    // model with no rule, never more one-to-one children than there are parents left.
    const generated =
      rule?.data !== undefined
        ? 0
        : (rule?.count ??
          (context.config.count === null ? 0 : Math.min(context.config.count, ...parentCounts)))
    // A parent a real row points at is spoken for; the others are dealt out to the rest.
    const pools = new Map(
      oneToOne.map((fk) => {
        const parents = context.rowsByModel.get(fk.toModel) ?? []
        const claimed = new Set(queue.flatMap((given) => claimOf(fk, given, parents) ?? []))
        return [
          fk.field,
          context.faker.helpers.shuffle(
            parents.filter((parent) => !claimed.has(uniqueKey(parent, fk.toFields))),
          ),
        ] as const
      }),
    )
    const slots = new Map<string, number>(oneToOne.map((fk) => [fk.field, 0]))
    const seen = new Map(
      table.uniques.map((fields) => [fields.join(' '), new Set<string>()] as const),
    )
    // Rows accumulate in place: a spread per row would be quadratic.
    const rows: SeedRow[] = []
    for (let index = 0; index < queue.length + generated; index += 1) {
      const given = queue[index] ?? null
      const row = yield* attemptRow(
        { context, table, index, own: rows, given, pools, slots: new Map(slots) },
        seen,
      )
      if (given !== null) yield* nestChildren(context, table, given, row)
      for (const fk of oneToOne) {
        if (
          given === null ||
          claimOf(fk, given, context.rowsByModel.get(fk.toModel) ?? []) === null
        ) {
          slots.set(fk.field, (slots.get(fk.field) ?? 0) + 1)
        }
      }
      for (const fields of table.uniques) {
        seen.get(fields.join(' '))?.add(uniqueKey(row, fields))
      }
      for (const fk of table.foreignKeys) {
        const parent = uniqueKey(row, fk.fromFields)
        if (fk.fromFields.some((field) => row[field] !== null && row[field] !== undefined)) {
          const counts =
            context.linkCounts.get(`${table.name}.${fk.field}`) ?? new Map<string, number>()
          counts.set(parent, (counts.get(parent) ?? 0) + 1)
          context.linkCounts.set(`${table.name}.${fk.field}`, counts)
        }
      }
      // oxlint-disable-next-line custom/no-mutation -- see the declaration above: in-place keeps it linear
      rows.push(row)
    }
    context.givenByModel.set(table.name, queue)
    yield* validateRows(table, rows)
    const all: readonly SeedRow[] = rows
    return all
  })
}

/** The id of the partner a link names, by id or by a unique key; fails when no row matches. */
function linkedPartner(
  own: JoinSide,
  other: JoinSide,
  index: number,
  partners: readonly SeedRow[],
  link: SeedValue,
) {
  return Effect.gen(function* () {
    const partner = isKeyObject(link)
      ? partners.find((candidate) =>
          Object.entries(link).every(
            ([field, value]) => keyOf(candidate[field] ?? null) === keyOf(value),
          ),
        )
      : partners.find((candidate) => keyOf(candidate[other.idField] ?? null) === keyOf(link))
    if (partner !== undefined) return partner[other.idField] ?? null
    const shown = isKeyObject(link)
      ? Object.entries(link)
          .map(([field, value]) => `${field} = ${describeValue(value)}`)
          .join(', ')
      : `${other.idField} = ${describeValue(link)}`
    return yield* new SeedGenerationError({
      message: `${own.model} data[${index}].${own.field}: no ${other.model} has ${shown}.\n   Give ${other.model} that row.`,
    })
  })
}

/** The pairs one real row lists (`tags: [1, { label: 'x' }]`), each partner checked to exist. */
function listedPairsOf(
  own: JoinSide,
  other: JoinSide,
  index: number,
  given: SeedRow,
  row: SeedRow | undefined,
  partners: readonly SeedRow[],
) {
  return Effect.gen(function* () {
    const links = given[own.field]
    if (links === undefined || links === null) return []
    if (!isSeedList(links)) {
      return yield* new SeedGenerationError({
        message: `${own.model} data[${index}].${own.field}: expected a list of ${other.model} ids or keys.`,
      })
    }
    const ids = yield* Effect.forEach(links, (link) =>
      linkedPartner(own, other, index, partners, link),
    )
    return ids.map((id) => ({ [own.column]: row?.[own.idField] ?? null, [other.column]: id }))
  })
}

/** The pairs a side's real rows list themselves. */
function listedPairs(context: Context, own: JoinSide, other: JoinSide) {
  const data = context.givenByModel.get(own.model) ?? []
  const rows = context.rowsByModel.get(own.model) ?? []
  const partners = context.rowsByModel.get(other.model) ?? []
  return Effect.forEach(data, (given, index) =>
    listedPairsOf(own, other, index, given, rows[index], partners),
  ).pipe(Effect.map((pairs) => pairs.flat()))
}

/**
 * Pairs for a join table. Real rows list their own links (`tags: [{ label }]` on a Post row, or
 * `posts` on a Tag row) and get nothing else; faker rows are linked to `min`..`max` distinct rows
 * of the other side by a relation rule, iterating the side that carries the rule (the A side
 * without one). The rule is then checked against every row, real or not.
 */
function makeJoinRows(context: Context, table: JoinTable) {
  return Effect.gen(function* () {
    const [a, b] = table.sides
    const listed = [...(yield* listedPairs(context, a, b)), ...(yield* listedPairs(context, b, a))]
    const ruleA = context.config.models[a.model]?.relations?.[a.field]
    const ruleB = context.config.models[b.model]?.relations?.[b.field]
    const [from, to, rule] =
      ruleA === undefined && ruleB !== undefined ? [b, a, ruleB] : [a, b, ruleA ?? {}]
    const real = context.givenByModel.get(from.model)?.length ?? 0
    const rows = (context.rowsByModel.get(from.model) ?? []).slice(real)
    const partners = context.rowsByModel.get(to.model) ?? []
    // A faker row on the other side is a partner for everyone; a real row only when it has room.
    const drawn = rows.flatMap((row) => {
      const min = Math.min(rule.min ?? 0, partners.length)
      const max = Math.min(rule.max ?? 3, partners.length)
      const count = context.faker.number.int({ min, max: Math.max(min, max) })
      return context.faker.helpers.arrayElements(partners, count).map((partner) => ({
        [from.column]: row[from.idField] ?? null,
        [to.column]: partner[to.idField] ?? null,
      }))
    })
    return dedupe([...listed, ...drawn])
  })
}

/** The pairs once each: a link listed on both sides, or drawn twice, is one row of the join table. */
function dedupe(pairs: readonly SeedRow[]) {
  const seen = new Set<string>()
  return pairs.filter((pair) => {
    const key = `${keyOf(pair.A ?? null)} ${keyOf(pair.B ?? null)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function makeTableRows(
  context: Context,
  rowsByModel: Map<string, readonly SeedRow[]>,
  table: SeedTable,
) {
  return Effect.gen(function* () {
    if (table.kind === 'join') {
      const rows = yield* makeJoinRows(context, table)
      rowsByModel.set(table.name, rows)
      const entry: SeedTableRows = { table, rows }
      return entry
    }
    const rows = yield* makeModelRows(context, table)
    rowsByModel.set(table.name, rows)
    const entry: SeedTableRows = { table, rows }
    return entry
  })
}

/**
 * Rows for every table of the plan, in plan order, from one seeded faker: given rows first and
 * as written, parents before children, each foreign key pointing at a row that exists, every
 * unique constraint honoured, every validator passed.
 */
export function generateSeedRows(input: {
  readonly tables: readonly SeedTable[]
  readonly config: ResolvedSeedConfig
  readonly faker: Faker
}) {
  return Effect.gen(function* () {
    yield* checkRules(input.tables, input.config)
    const rowsByModel = new Map<string, readonly SeedRow[]>()
    const context: Context = {
      faker: input.faker,
      config: input.config,
      tables: input.tables,
      rowsByModel,
      pending: new Map(),
      givenByModel: new Map(),
      linkCounts: new Map(),
    }
    const entries = yield* Effect.forEach(input.tables, (table) =>
      makeTableRows(context, rowsByModel, table),
    )
    yield* checkCardinality(context)
    return entries
  })
}
