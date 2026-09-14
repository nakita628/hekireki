import type { DMMF } from '@prisma/generator-helper'
import { Effect } from 'effect'
import * as z from 'zod'

import type { SeedRow, SeedValue } from './config.js'
import { SeedGenerationError } from './errors.js'
import type { EnumMember, ModelTable } from './plan.js'
import { fieldDefault } from './plan.js'
import { nativeTypeOf } from './values.js'

const INT_RANGES: Readonly<Record<string, readonly [number, number]>> = {
  TinyInt: [-128, 127],
  UnsignedTinyInt: [0, 255],
  SmallInt: [-32_768, 32_767],
  UnsignedSmallInt: [0, 65_535],
  MediumInt: [-8_388_608, 8_388_607],
  UnsignedMediumInt: [0, 16_777_215],
  UnsignedInt: [0, 4_294_967_295],
}

/** The zod format of an id, from its `@default` or `@db.Uuid`: uuid, uuidv7, cuid, cuid2, ulid, nanoid. */
function idSchema(field: DMMF.Field) {
  const generated = fieldDefault(field)
  const argument = String(generated?.args[0] ?? '')
  switch (generated?.name ?? '') {
    case 'uuid':
      return argument === '7' ? z.uuidv7('Invalid UUID v7') : z.uuid()
    case 'cuid':
      // cuid v1 is retired by its authors and by zod; Prisma still offers it, so its shape is spelled out.
      return argument === '2'
        ? z.cuid2().length(24, 'Invalid cuid2: 24 characters expected')
        : z.string().regex(/^c[a-z0-9]{24}$/u, 'Invalid cuid')
    case 'ulid':
      return z.ulid()
    case 'nanoid': {
      const length = Number(argument)
      return Number.isInteger(length) && length > 0 && length !== 21
        ? z
            .string()
            .regex(new RegExp(`^[\\w-]{${length}}$`, 'u'), `Invalid nanoid of ${length} characters`)
        : z.nanoid()
    }
    default:
      return nativeTypeOf(field).name === 'Uuid' ? z.uuid() : null
  }
}

// cspell:ignore emailaddress
/** What a String field is by its name: an email address or a URL. */
function namedSchema(field: DMMF.Field) {
  const name = field.name.toLowerCase().replaceAll(/[_-]/gu, '')
  if (/^(e?mail|emailaddress)$/u.test(name)) return z.email()
  if (/^(url|uri|website|homepage)$/u.test(name)) return z.url()
  return null
}

function stringSchema(field: DMMF.Field) {
  const base = idSchema(field) ?? namedSchema(field) ?? z.string()
  const native = nativeTypeOf(field)
  const limit =
    native.name !== null && /^(Var|N|NVar)?Char$/u.test(native.name) ? native.args[0] : undefined
  return limit === undefined || !(limit > 0) ? base : base.max(limit)
}

function intSchema(field: DMMF.Field) {
  const native = nativeTypeOf(field)
  const [minimum, maximum] = (native.name === null ? undefined : INT_RANGES[native.name]) ?? [
    -2_147_483_648, 2_147_483_647,
  ]
  return z.int().min(minimum).max(maximum)
}

function decimalSchema(field: DMMF.Field) {
  const native = nativeTypeOf(field)
  const [precision, scale] = native.args
  if (
    native.name !== null &&
    /^(Decimal|Numeric)$/u.test(native.name) &&
    precision !== undefined &&
    scale !== undefined
  ) {
    const integer = Math.max(precision - scale, 1)
    return z
      .string()
      .regex(
        new RegExp(`^-?\\d{1,${integer}}(\\.\\d{1,${Math.max(scale, 1)}})?$`, 'u'),
        `Invalid decimal: at most ${precision - scale} integer and ${scale} fraction digits (@db.${native.name}(${precision}, ${scale}))`,
      )
  }
  return z.string().regex(/^-?\d+(\.\d+)?$/u, 'Invalid decimal string')
}

/** What the field's stored scalar must look like, from its type, `@default` and `@db` attributes. */
function scalarSchema(field: DMMF.Field, enumValues: readonly EnumMember[] | null) {
  if (field.kind === 'enum') return z.enum((enumValues ?? []).map((member) => member.name))
  switch (field.type) {
    case 'String':
      return stringSchema(field)
    case 'Int':
      return intSchema(field)
    case 'BigInt':
      return z.bigint()
    case 'Float':
      return z.number()
    case 'Decimal':
      return decimalSchema(field)
    case 'Boolean':
      return z.boolean()
    case 'DateTime':
      return z.date()
    case 'Json':
      return z.json()
    case 'Bytes':
      return z.instanceof(Uint8Array)
    default:
      return z.string()
  }
}

/** The zod schema a column's value must pass: the scalar, in a list or nullable as declared. */
export function fieldSchema(field: DMMF.Field, enumValues: readonly EnumMember[] | null) {
  const scalar = scalarSchema(field, enumValues)
  if (field.isList) return z.array(scalar)
  return field.isRequired ? scalar : scalar.nullable()
}

/** The zod schema a whole row of the table must pass, one field per insertable column. */
export function rowSchema(table: ModelTable) {
  return z.object(
    Object.fromEntries(
      table.columns.flatMap((column) => {
        const field = table.model.fields.find((f) => f.name === column.field)
        return field === undefined ? [] : [[column.field, fieldSchema(field, column.enumValues)]]
      }),
    ),
  )
}

function describeValue(value: SeedValue | undefined) {
  if (value === undefined) return 'nothing'
  if (typeof value === 'bigint') return `${value.toString()}n`
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Uint8Array) return `<${value.length} bytes>`
  return JSON.stringify(value)
}

/** `["tags", 0]` as zod reports a path, as `tags[0]` and the field name. */
function readPath(path: readonly PropertyKey[]) {
  const [first = '', ...rest] = path.map(String)
  const text = rest.map((segment, i) =>
    typeof path[i + 1] === 'number' ? `[${segment}]` : `.${segment}`,
  )
  return { text: first + text.join(''), field: first }
}

/** One line per failed value, `Model[index].field: what went wrong (got what was there)`. */
function issuesOf(table: ModelTable, index: number, row: SeedRow, error: z.ZodError) {
  return error.issues.map((issue) => {
    const { text, field } = readPath(issue.path)
    return `${table.name}[${index}].${text}: ${issue.message} (got ${describeValue(row[field])})`
  })
}

/**
 * Checks every row against the schema built from the Prisma schema: the plain types, enum
 * members, id formats, email and URL fields, `@db` lengths and ranges, decimal digits, dates,
 * lists and nullability. Nothing is inserted while one value fails.
 */
export function validateRows(table: ModelTable, rows: readonly SeedRow[]) {
  return Effect.gen(function* () {
    const schema = rowSchema(table)
    const problems = rows.flatMap((row, index) => {
      const result = schema.safeParse(row)
      return result.success ? [] : issuesOf(table, index, row, result.error)
    })
    if (problems.length > 0) {
      const shown = problems.slice(0, 20)
      const more = problems.length - shown.length
      yield* new SeedGenerationError({
        message: `${table.name}: ${problems.length} value${problems.length === 1 ? '' : 's'} failed validation, nothing was inserted.\n   ${shown.join('\n   ')}${more > 0 ? `\n   ... and ${more} more` : ''}`,
      })
    }
  })
}
