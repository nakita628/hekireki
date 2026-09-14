import type { DMMF } from '@prisma/generator-helper'
import { Effect } from 'effect'

import type { SeedRow } from '../config.js'
import { SeedGenerationError } from '../errors.js'
import { fieldDefault } from '../plan.js'
import type { ModelTable, SeedColumn } from '../plan.js'
import { dateBetween, generatedDefault, makeFieldValue } from '../values.js'
import type { RowInput } from './context.js'
import { MAX_ATTEMPTS, describeValue, uniqueKey } from './context.js'
import { normalizeGiven, normalizeValue } from './normalize.js'
import { pickParent } from './parents.js'

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

/** One omitted column of a real row with its default, as a `[field, value]` entry. */
function defaultEntry(input: RowInput, column: SeedColumn) {
  return Effect.gen(function* () {
    const field = input.table.model.fields.find((f) => f.name === column.field)
    const value = field === undefined ? null : yield* defaultValue(input, field)
    return [column.field, value] as const
  })
}

/** The columns a real row leaves out, each filled with its default. */

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

/**
 * Rows until one meets every unique constraint; the last attempt is patched by hand. A given
 * row is taken as written, so a clash in it is reported, not worked around.
 */
export function attemptRow(input: RowInput, seen: ReadonlyMap<string, ReadonlySet<string>>) {
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
