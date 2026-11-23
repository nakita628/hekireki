import type { DMMF } from '@prisma/generator-helper'

import { isAnnotationLine, stripAnnotations } from '../annotation/index.js'
import { makePascalCase, makeSnakeCase } from '../naming/case.js'
import type { RelationEnd } from '../prisma/model.js'
import {
  backRelation,
  fieldColumn,
  primaryKeyFields,
  referentialActions,
  relationEnds,
} from '../prisma/model.js'
import { prismaConstraintName } from '../prisma/postgres.js'

/**
 * The Ecto type of a scalar Prisma type. A DateTime and a Json are not of Ecto's own: a DateTime is
 * kept in one of the types `ectoDateTypes` writes beside the schemas, which `dateTimeModule` names,
 * and a Json in the `PrismaJson` that `ectoJsonType` writes.
 */
export function prismaTypeToEctoType(
  type: string,
): 'integer' | 'string' | 'boolean' | 'float' | 'decimal' | 'map' | 'binary' {
  if (type === 'Int') return 'integer'
  if (type === 'BigInt') return 'integer'
  if (type === 'Float') return 'float'
  if (type === 'Decimal') return 'decimal'
  if (type === 'String') return 'string'
  if (type === 'Boolean') return 'boolean'
  if (type === 'Json') return 'map'
  if (type === 'Bytes') return 'binary'
  return 'string'
}

// What each of the types written beside the schemas holds, as a typespec.
const WRITTEN_TYPESPECS: ReadonlyMap<string, string> = new Map([
  ['PrismaDateTime', 'DateTime.t()'],
  ['PrismaDate', 'Date.t()'],
  ['PrismaTime', 'Time.t()'],
  ['PrismaJson', 'map() | list() | String.t() | number() | boolean()'],
])

/**
 * The type a DateTime field is kept in, by the column Prisma makes of it: a `@db.Date` holds a
 * date, a `@db.Time` or `@db.Timetz` a time of day, and every other column an instant.
 */
export function dateTimeModule(field: DMMF.Field) {
  const native = field.nativeType?.[0]
  if (native === 'Date') return 'PrismaDate'
  if (native === 'Time' || native === 'Timetz') return 'PrismaTime'
  return 'PrismaDateTime'
}

/** Whether a model has a Json column, which is kept in the type `ectoJsonType` writes. */
export function hasJsonField(model: DMMF.Model) {
  return model.fields.some((f) => f.kind === 'scalar' && f.type === 'Json')
}

/** The DateTime columns of a model, which are kept in the types `ectoDateTypes` writes. */
export function dateTimeFields(model: DMMF.Model) {
  return model.fields.filter((f) => f.kind === 'scalar' && f.type === 'DateTime')
}

export function ectoTypeToTypespec(type: string) {
  // A type written beside the schemas is named with the app's module in front of it.
  const written = WRITTEN_TYPESPECS.get(type.split('.').at(-1) ?? '')
  if (written !== undefined) return written
  switch (type) {
    case 'string':
      return 'String.t()'
    case 'integer':
      return 'integer()'
    case 'float':
      return 'float()'
    case 'boolean':
      return 'boolean()'
    case 'binary_id':
    case 'Ecto.UUID':
      return 'Ecto.UUID.t()'
    case 'Ecto.ULID':
      return 'Ecto.ULID.t()'
    case 'naive_datetime':
      return 'NaiveDateTime.t()'
    case 'utc_datetime':
      return 'DateTime.t()'
    case 'decimal':
      return 'Decimal.t()'
    case 'map':
      return 'map()'
    case 'binary':
      return 'binary()'
    default:
      return 'term()'
  }
}

// A String that PostgreSQL holds in a uuid column, which Postgrex takes as 16 bytes and not as
// the 36 characters: Ecto.UUID casts the text and dumps the bytes.
function isUuidColumn(field: DMMF.Field) {
  return field.type === 'String' && field.nativeType?.[0] === 'Uuid'
}

// Ecto type references are atoms (:binary_id) or modules (Ecto.ULID).
function formatEctoType(type: string) {
  return /^[A-Z]/u.test(type) ? type : `:${type}`
}

// The key Ecto generates for a primary key, by the field's type and @default.
function generatedKey(field: DMMF.Field) {
  const def = field.default
  if (typeof def !== 'object' || !('name' in def)) return null
  if (field.type === 'String' && def.name === 'uuid') {
    return 'args' in def && def.args[0] === 7 ? 'uuid7' : 'uuid'
  }
  // ULID PK: String + @default(ulid()) — requires the ecto_ulid_next package.
  if (field.type === 'String' && def.name === 'ulid') return 'ulid'
  if ((field.type === 'Int' || field.type === 'BigInt') && def.name === 'autoincrement') {
    return 'autoincrement'
  }
  return null
}

function getPrimaryKeyConfig(field: DMMF.Field) {
  const key = generatedKey(field)
  // @primary_key always declares the :id field; when the actual column
  // (@map / a differently named @id field) is not "id", map it via :source.
  const pkColumn = field.dbName ?? field.name
  const sourceOpt = pkColumn === 'id' ? '' : `, source: :${pkColumn}`

  if (key === 'uuid' || key === 'uuid7') {
    const isV7 = key === 'uuid7'
    // @db.Uuid and SQL Server's @db.UniqueIdentifier are uuid columns, which Ecto's adapters write
    // as 16 bytes. Every other uuid() key is a text column holding the 36 characters Prisma Client
    // writes, so the key is a string.
    const native = field.nativeType?.[0]
    if (native !== 'Uuid' && native !== 'UniqueIdentifier') {
      return {
        line: `@primary_key {:id, :string, autogenerate: {Ecto.UUID, :generate, [${isV7 ? '[version: 7]' : ''}]}${sourceOpt}}`,
        typeSpec: 'String.t()',
        omitIdFieldInSchema: true,
        foreignKeyType: 'string',
      }
    }
    return {
      // UUIDv7 autogeneration requires Ecto 3.14+.
      line: isV7
        ? `@primary_key {:id, Ecto.UUID, autogenerate: [version: 7]${sourceOpt}}`
        : `@primary_key {:id, :binary_id, autogenerate: true${sourceOpt}}`,
      typeSpec: 'Ecto.UUID.t()',
      omitIdFieldInSchema: true,
      foreignKeyType: 'binary_id',
    }
  }

  if (key === 'ulid') {
    return {
      line: `@primary_key {:id, Ecto.ULID, autogenerate: true${sourceOpt}}`,
      typeSpec: 'Ecto.ULID.t()',
      omitIdFieldInSchema: true,
      foreignKeyType: 'Ecto.ULID',
    }
  }

  if (key === 'autoincrement') {
    return {
      line: `@primary_key {:id, :id, autogenerate: true${sourceOpt}}`,
      typeSpec: 'integer()',
      omitIdFieldInSchema: true,
      foreignKeyType: null,
    }
  }

  return {
    line: '@primary_key false',
    typeSpec: 'String.t()',
    omitIdFieldInSchema: false,
    foreignKeyType: null,
  }
}

function isNowDefault(field: DMMF.Field) {
  const def = field.default
  return typeof def === 'object' && def !== null && 'name' in def && def.name === 'now'
}

// A DateTime field a `timestamps()` call can hold.
function isStamped(field: DMMF.Field) {
  return field.kind === 'scalar' && field.type === 'DateTime' && !field.isList
}

/**
 * The DateTime fields Prisma Client fills itself, as `timestamps()` calls, which fill them the same
 * way: on insert when the caller gives none, and an `updated_at` on every update that changes
 * something, each from its type's `autogenerate/0`. A `createdAt` (or `created_at`,
 * `inserted_at`) with `@default(now())` is Ecto's `inserted_at` and the first `@updatedAt` its
 * `updated_at`, in one call when they are of one type, so an insert gives them one time. Each
 * other `@updatedAt` is a call of its own with no `inserted_at`, as a schema can have one
 * `updated_at` to a call. A field keeps its own name where Ecto's is taken by another field.
 *
 * Ecto calls `autogenerate/0` once to a call and once to an `autogenerate: true` field, and has no
 * option that fills fields of several calls from one value: the type's `autogenerate/0` gives the
 * calls of one insert the instant the first of them read, as Prisma Client gives one `now()`. An
 * optional `@updatedAt` left
 * `nil` on insert is filled, as nil is a struct's default and the insert does not count it as a
 * change; `force_change(changeset, field, nil)` stores null, as Prisma does for an explicit null.
 *
 * The type most of them have, `PrismaDateTime`, is `@timestamps_opts` (`attribute`); a call for
 * a `@db.Date` or `@db.Time` names its own. `types` are the fields the calls add, for `@type t`.
 *
 * @example
 * ```elixir
 * @timestamps_opts [type: App.PrismaDateTime, autogenerate: {App.PrismaDateTime, :autogenerate, []}]
 *
 * timestamps(inserted_at_source: :createdAt, updated_at_source: :updatedAt)
 * timestamps(inserted_at: false, updated_at: :synced_at, updated_at_source: :syncedAt)
 * ```
 */
const INSERTED_AT_ALIASES = new Set(['inserted_at', 'created_at', 'createdAt'])

function makeTimestampsLines(fields: readonly DMMF.Field[], appName: string) {
  const inserted = fields.find(
    (f) =>
      isStamped(f) && INSERTED_AT_ALIASES.has(f.name) && isNowDefault(f) && f.isUpdatedAt !== true,
  )
  const updated = fields.filter((f) => isStamped(f) && f.isUpdatedAt === true)
  const exclude = new Set([...(inserted ? [inserted.name] : []), ...updated.map((f) => f.name)])
  // Ecto's name for the field, unless another field of the model has it.
  const named = (field: DMMF.Field, ecto: string) =>
    fields.some((f) => f !== field && makeSnakeCase(f.name) === ecto)
      ? makeSnakeCase(field.name)
      : ecto
  const [first, ...others] = updated
  const stamps = [
    ...(inserted
      ? [{ key: 'inserted_at', field: inserted, name: named(inserted, 'inserted_at') }]
      : []),
    ...(first ? [{ key: 'updated_at', field: first, name: named(first, 'updated_at') }] : []),
    ...others.map((field) => ({
      key: 'updated_at',
      field,
      name: named(field, makeSnakeCase(field.name)),
    })),
  ]
  const options = ({ key, field, name }: (typeof stamps)[number]) => {
    const source = field.dbName ?? field.name
    return [
      ...(name === key ? [] : [`${key}: :${name}`]),
      ...(source === name ? [] : [`${key}_source: :${source}`]),
    ]
  }
  const together =
    inserted !== undefined &&
    first !== undefined &&
    dateTimeModule(inserted) === dateTimeModule(first)
  const calls = together
    ? [
        { module: dateTimeModule(inserted), options: stamps.slice(0, 2).flatMap(options) },
        ...stamps.slice(2).map((stamp) => ({
          module: dateTimeModule(stamp.field),
          options: ['inserted_at: false', ...options(stamp)],
        })),
      ]
    : stamps.map((stamp) => ({
        module: dateTimeModule(stamp.field),
        options:
          stamp.key === 'inserted_at'
            ? [...options(stamp), 'updated_at: false']
            : ['inserted_at: false', ...options(stamp)],
      }))
  const typed = (module: string) =>
    `type: ${appName}.${module}, autogenerate: {${appName}.${module}, :autogenerate, []}`
  return {
    attribute: calls.some((call) => call.module === 'PrismaDateTime')
      ? `  @timestamps_opts [${typed('PrismaDateTime')}]`
      : null,
    lines: calls.map(
      (call) =>
        `    timestamps(${[...(call.module === 'PrismaDateTime' ? [] : [typed(call.module)]), ...call.options].join(', ')})`,
    ),
    types: stamps.map(
      ({ field, name }) =>
        `${name}: ${ectoTypeToTypespec(dateTimeModule(field))}${field.isRequired ? '' : ' | nil'}`,
    ),
    exclude,
  }
}

// The Ecto type of a foreign key is the type of the field it references: the target's primary
// key, or another unique field named in `references:`.
function getBelongsToFkType(
  allModels: readonly DMMF.Model[],
  targetModelName: string,
  referencedFieldName: string | undefined,
  appName: string,
) {
  const targetModel = allModels.find((m) => m.name === targetModelName)
  if (!targetModel) return null
  const targetPk = targetModel.fields.find((f) => f.isId)
  const referenced = targetModel.fields.find((f) => f.name === referencedFieldName) ?? targetPk
  if (!referenced) return null

  const pkConfig = referenced.isId ? getPrimaryKeyConfig(referenced) : null

  if (pkConfig !== null && pkConfig.foreignKeyType !== null) return pkConfig.foreignKeyType

  // Autoincrement integer PK → no explicit FK type needed (Ecto default :id)
  if (pkConfig?.line.includes(':id, autogenerate') === true) return null

  if (referenced.type === 'String') return isUuidColumn(referenced) ? 'Ecto.UUID' : 'string'
  if (referenced.type === 'DateTime') return `${appName}.${dateTimeModule(referenced)}`

  const ectoType = prismaTypeToEctoType(referenced.type)
  if (ectoType === 'integer') return null
  return ectoType
}

// The name Ecto knows a referenced field by: a primary key it declares with @primary_key is
// always :id, whatever the Prisma field or its column is called.
function ectoFieldName(model: DMMF.Model | undefined, fieldName: string) {
  const field = model?.fields.find((f) => f.name === fieldName)
  return field?.isId === true && getPrimaryKeyConfig(field).omitIdFieldInSchema
    ? 'id'
    : makeSnakeCase(fieldName)
}

// Ecto's belongs_to takes a single foreign_key: a composite FK would
// half-join on the first column, so it emits no association and the FK
// columns stay plain fields.
function belongsToAssociation(
  field: DMMF.Field,
  targetModel: DMMF.Model | undefined,
  allModels: readonly DMMF.Model[],
  appName: string,
) {
  const fromFields = field.relationFromFields ?? []
  if (fromFields.length > 1) return null
  return {
    name: field.name,
    targetModel: field.type,
    foreignKey: fromFields[0] ?? '',
    fkType: getBelongsToFkType(allModels, field.type, field.relationToFields?.[0], appName),
    references: ectoFieldName(targetModel, field.relationToFields?.[0] ?? 'id'),
  }
}

// Prisma's join table holds the model that sorts first in "A". A model related to itself
// is on both sides: the relation field whose name sorts first reads its own key from "A".
function manyToManyAssociation(
  model: DMMF.Model,
  end: Extract<RelationEnd, { kind: 'manyToMany' }>,
  targetModel: DMMF.Model,
  ownKey: string,
) {
  const { field } = end
  const [left, right] = end.isSideA ? [model.name, field.type] : [field.type, model.name]
  return {
    name: field.name,
    targetModel: field.type,
    joinThrough: `_${field.relationName ?? `${left}To${right}`}`,
    ownJoinColumn: end.isSideA ? 'A' : 'B',
    ownKey,
    relatedJoinColumn: end.isSideA ? 'B' : 'A',
    relatedKey: ectoFieldName(targetModel, targetModel.fields.find((f) => f.isId)?.name ?? 'id'),
  }
}

// A has_many or has_one, keyed by the inverse field's single foreign key.
function ownedAssociation(model: DMMF.Model, field: DMMF.Field, fkField: DMMF.Field) {
  const fromFields = fkField.relationFromFields ?? []
  if (fromFields.length > 1) return null
  return {
    name: field.name,
    targetModel: field.type,
    foreignKey: fromFields[0] ?? '',
    references: ectoFieldName(model, fkField.relationToFields?.[0] ?? 'id'),
  }
}

function getAssociations(model: DMMF.Model, allModels: readonly DMMF.Model[], appName: string) {
  const modelsByName = new Map(allModels.map((m) => [m.name, m]))
  const ownKey = ectoFieldName(model, model.fields.find((f) => f.isId)?.name ?? 'id')
  const belongsTo: NonNullable<ReturnType<typeof belongsToAssociation>>[] = []
  const hasMany: NonNullable<ReturnType<typeof ownedAssociation>>[] = []
  const hasOne: NonNullable<ReturnType<typeof ownedAssociation>>[] = []
  const manyToMany: ReturnType<typeof manyToManyAssociation>[] = []

  for (const end of relationEnds(model, allModels)) {
    const targetModel = modelsByName.get(end.field.type)
    if (end.kind === 'belongsTo') {
      belongsTo.push(...nonNull(belongsToAssociation(end.field, targetModel, allModels, appName)))
      continue
    }
    if (targetModel === undefined) continue
    if (end.kind === 'manyToMany') {
      manyToMany.push(manyToManyAssociation(model, end, targetModel, ownKey))
    } else if (end.kind === 'hasMany') {
      hasMany.push(...nonNull(ownedAssociation(model, end.field, end.inverse)))
    } else {
      hasOne.push(...nonNull(ownedAssociation(model, end.field, end.inverse)))
    }
  }

  return { belongsTo, hasMany, hasOne, manyToMany }
}

function nonNull<T>(value: T | null) {
  return value === null ? [] : [value]
}

// The Ecto option of a function @default.
function functionDefaultOption(def: DMMF.FieldDefault) {
  // now() is filled by Prisma's client, not left to the column's default (SQLite's
  // CURRENT_TIMESTAMP writes another form): the type's autogenerate/0 fills it on insert.
  if (def.name === 'now') return 'autogenerate: true'
  // A default the database applies (dbgenerated()): Ecto leaves a nil field out of the INSERT,
  // so the database fills it, and reads it back to have it on the struct.
  if (def.name === 'dbgenerated') return 'read_after_writes: true'
  // uuid() outside a primary key is made by Prisma's client, not the database: Ecto makes it
  // on insert, as the 36 characters a text column holds and a @db.Uuid field's Ecto.UUID dumps.
  if (def.name === 'uuid') {
    return def.args[0] === 7
      ? 'autogenerate: {Ecto.UUID, :generate, [[version: 7]]}'
      : 'autogenerate: {Ecto.UUID, :generate, []}'
  }
  // ulid() likewise, with Ecto.ULID from ecto_ulid_next, the package a ULID primary key needs.
  if (def.name === 'ulid') return 'autogenerate: {Ecto.ULID, :generate, []}'
  return null
}

// DMMF carries BigInt defaults as digit strings, DateTime literals
// as ISO strings, and Json defaults as JSON text, which becomes the
// Elixir term PrismaJson holds. A DateTime is the instant in UTC with
// milliseconds, as Prisma's client holds it, whatever offset the
// literal was written with; a date or a time of day is its UTC part.
function stringDefaultOption(f: DMMF.Field, def: string) {
  if (f.type === 'BigInt') return `default: ${def}`
  if (f.type === 'DateTime') {
    const iso = new Date(def).toISOString()
    const module = dateTimeModule(f)
    if (module === 'PrismaDate') return `default: ~D[${iso.slice(0, 10)}]`
    if (module === 'PrismaTime') return `default: ~T[${iso.slice(11, 23)}]`
    return `default: ~U[${iso.slice(0, 10)} ${iso.slice(11, 23)}Z]`
  }
  if (f.type === 'Json') {
    const parsed: unknown = JSON.parse(def)
    return parsed === null ? null : `default: ${jsonToElixirLiteral(parsed)}`
  }
  if (isUuidColumn(f)) {
    // Ecto dumps a :default when the schema compiles, and Ecto.UUID takes the 36 characters only.
    // PostgreSQL also reads a uuid without its hyphens or in braces, and returns it in lower case:
    // the default is written as the database returns it, and left to the database when it is not
    // a uuid at all.
    const hex = def.replaceAll(/[{}-]/gu, '').toLowerCase()
    return /^[0-9a-f]{32}$/u.test(hex)
      ? `default: "${[hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')}"`
      : null
  }
  return `default: ${toElixirString(def)}`
}

// The Ecto option a Prisma @default becomes, or null where Ecto has nothing to say.
function ectoDefaultOption(f: DMMF.Field) {
  const def = f.default
  const type = prismaTypeToEctoType(f.type)
  if (def === undefined || def === null) return null
  if (typeof def === 'object' && 'name' in def) return functionDefaultOption(def)
  if (typeof def === 'string') return stringDefaultOption(f, def)
  // Ecto rejects an integer default on a :float field
  // ("value 0 is invalid for type :float"): emit a float literal.
  // A :decimal default likewise only dumps as %Decimal{}, never as a
  // bare float.
  if (typeof def === 'number') {
    if (type === 'decimal') return `default: Decimal.new("${def}")`
    return type === 'float' && Number.isInteger(def) ? `default: ${def}.0` : `default: ${def}`
  }
  if (typeof def === 'boolean') return `default: ${def}`
  return null
}

function toElixirString(value: string) {
  const escaped = value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('#{', '\\#{')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
  return `"${escaped}"`
}

// A JSON number as an Elixir literal: JavaScript writes a large or a small one with an exponent
// (`1e+21`, `1e-7`), which Elixir reads only as a float with a fraction (`1.0e21`, `1.0e-7`).
function elixirNumber(value: number) {
  const [mantissa = '', exponent] = String(value).split('e')
  if (exponent === undefined) return mantissa
  return `${mantissa.includes('.') ? mantissa : `${mantissa}.0`}e${exponent.replace('+', '')}`
}

function jsonToElixirLiteral(value: unknown): string {
  if (value === null) return 'nil'
  if (value === true) return 'true'
  if (value === false) return 'false'
  if (typeof value === 'number') return elixirNumber(value)
  if (typeof value === 'string') return toElixirString(value)
  if (Array.isArray(value)) return `[${value.map(jsonToElixirLiteral).join(', ')}]`
  if (typeof value === 'object') {
    return `%{${Object.entries(value)
      .map(([k, v]) => `${toElixirString(k)} => ${jsonToElixirLiteral(v)}`)
      .join(', ')}}`
  }
  return 'nil'
}

// The `/// @ecto.` calls of a doc comment, after the prefix, one call to a line. On a field each
// is an Ecto.Changeset function without its first argument, `validate_length(max: 50)` or
// `validate_required`, which the field is handed to; on a model each is a whole step of the
// pipeline, `validate_confirmation(:password)`, written as it is, but for `cast(...)`, whose
// options go to the changeset's own `cast`. A bare `/// @ecto` on a model asks for the changeset
// with nothing added. The prose comes first: once an `@ecto` line has been written, a line that is
// neither a call, a blank nor another annotation is a problem. A call opens its parentheses and
// closes them on the same line.
function ectoCalls(documentation: string | undefined) {
  const calls: { name: string; args: string }[] = []
  const problems: string[] = []
  let annotated = false
  for (const raw of (documentation ?? '').split('\n')) {
    const line = raw.trim()
    if (line === '@ecto') {
      annotated = true
    } else if (line.startsWith('@ecto.')) {
      annotated = true
      const call = line.slice('@ecto.'.length).trim()
      const m = call.match(/^([a-z_][a-z0-9_]*[!?]?)(?:\s*\(([\s\S]*)\))?$/u)
      if (call.includes('(') && !call.endsWith(')')) {
        problems.push(
          `the @ecto. call "${call}" does not close its parentheses on its line; an @ecto. call is one /// line`,
        )
      } else if (!m) {
        problems.push(`the @ecto. call "${call}" is not name or name(arguments)`)
      } else {
        calls.push({ name: m[1] ?? '', args: (m[2] ?? '').trim() })
      }
    } else if (line !== '' && !isAnnotationLine(line) && annotated) {
      problems.push(
        `the line "${line}" comes after an @ecto. call; write the description above them`,
      )
    }
  }
  return { annotated, calls, problems }
}

// The Ecto.Changeset functions that take a field after the changeset, which a field's line is.
const FIELD_FUNCTIONS = new Set([
  'validate_acceptance',
  'validate_change',
  'validate_confirmation',
  'validate_exclusion',
  'validate_format',
  'validate_inclusion',
  'validate_length',
  'validate_number',
  'validate_required',
  'validate_subset',
  'unsafe_validate_unique',
  'check_constraint',
  'exclusion_constraint',
  'foreign_key_constraint',
  'unique_constraint',
  'put_change',
  'force_change',
  'update_change',
  'delete_change',
])

// The fields a changeset casts: the scalar and enum fields of the schema, foreign keys included,
// without a primary key Ecto generates or the timestamps Ecto fills.
function castFields(model: DMMF.Model) {
  const idField = model.fields.find((f) => f.isId)
  const omitId = idField ? getPrimaryKeyConfig(idField).omitIdFieldInSchema : false
  const { exclude } = makeTimestampsLines(model.fields, '')
  return model.fields.filter(
    (f) => f.kind !== 'object' && !(f.isId && omitId) && !exclude.has(f.name),
  )
}

// Where the foreign key of a relation field is: on its own model (`belongs_to`), or on the model
// at the other end (`has_one`, `has_many`), with the relation field that holds it. Ecto has an
// association for a key of one column only; an implicit many-to-many has no key of either.
function foreignKeyOf(model: DMMF.Model, field: DMMF.Field, allModels: readonly DMMF.Model[]) {
  if ((field.relationFromFields?.length ?? 0) > 0) {
    return { side: 'owner' as const, owner: model, holder: field }
  }
  const other = allModels.find((m) => m.name === field.type)
  // The other end of this relation, not another relation of the same name on that model.
  const holder = backRelation(field, model, allModels)
  return other && holder && (holder.relationFromFields?.length ?? 0) > 0
    ? { side: 'inverse' as const, owner: other, holder }
    : null
}

/**
 * What keeps the schema's `@ecto.` comments from being read: a description written after the
 * calls, a call left open or in a shape that is not a call, a call on a field the changeset does
 * not cast, a function that does not take the field first, a `unique_constraint` on a field that
 * is not `@unique`, a `foreign_key_constraint` on a field that is not a foreign key, and on a
 * relation field anything but the `assoc_constraint` of the side with the key or the
 * `no_assoc_constraint` of the other, and a model named after a type a DateTime or a Json is kept
 * in (`PrismaDateTime`, `PrismaDate`, `PrismaTime`, `PrismaJson`) where the schema has one. Each names the model or
 * field it is on.
 */
// What is wrong with an @ecto. call on a relation field, given the side of the key it is on.
function relationCallProblems(name: string, side: 'owner' | 'inverse' | undefined) {
  if (name === 'assoc_constraint') {
    return side === 'owner'
      ? []
      : [
          'assoc_constraint is on a relation whose foreign key is not a column of this model; it belongs on the side with the key',
        ]
  }
  if (name === 'no_assoc_constraint') {
    return side === 'inverse'
      ? []
      : [
          'no_assoc_constraint is on a relation that is not a has_one or has_many; it belongs on the side the key points at',
        ]
  }
  return [
    `${name} is on a relation field, which takes assoc_constraint or no_assoc_constraint; write it as an @ecto. line on the model`,
  ]
}

// What is wrong with one @ecto. call on a field the changeset casts.
function scalarCallProblems(name: string, field: DMMF.Field, foreignKeys: ReadonlySet<string>) {
  if (!FIELD_FUNCTIONS.has(name)) {
    return [
      `${name} is not an Ecto.Changeset function that takes the field first; write it as an @ecto. line on the model`,
    ]
  }
  if (name === 'unique_constraint' && !(field.isUnique || field.isId)) {
    return [
      'unique_constraint is on a field that is not @unique; write a @@unique constraint as an @ecto. line on the model',
    ]
  }
  if (name === 'foreign_key_constraint' && !foreignKeys.has(field.name)) {
    return ['foreign_key_constraint is on a field that is not the foreign key of a relation']
  }
  return []
}

function scalarCallsProblems(
  field: DMMF.Field,
  calls: readonly { readonly name: string }[],
  cast: ReadonlySet<string>,
  foreignKeys: ReadonlySet<string>,
) {
  if (calls.length > 0 && !cast.has(field.name)) {
    return [
      'an @ecto. call is on a field the changeset does not cast: a primary key Ecto generates, or a timestamp',
    ]
  }
  return calls.flatMap((call) => scalarCallProblems(call.name, field, foreignKeys))
}

export function ectoProblems(models: readonly DMMF.Model[]) {
  const dateTypes = new Set<string>(
    models.flatMap((model) => dateTimeFields(model).map(dateTimeModule)),
  )
  const jsonType = models.some(hasJsonField)
  return models.flatMap((model) => {
    if (dateTypes.has(makePascalCase(model.name))) {
      return [
        `model ${model.name}: its module is the one the generator writes to keep a DateTime in; rename the model, or @@map it to its table under another name`,
      ]
    }
    if (jsonType && makePascalCase(model.name) === 'PrismaJson') {
      return [
        `model ${model.name}: its module is the one the generator writes to keep a Json in; rename the model, or @@map it to its table under another name`,
      ]
    }
    const cast = new Set(castFields(model).map((f) => f.name))
    const foreignKeys = new Set(
      model.fields.flatMap((f) =>
        f.relationFromFields?.[0] === undefined ? [] : [f.relationFromFields[0]],
      ),
    )
    return [
      ...ectoCalls(model.documentation).problems.map(
        (problem) => `model ${model.name}: ${problem}`,
      ),
      ...model.fields.flatMap((field) => {
        const { calls, problems } = ectoCalls(field.documentation)
        const key = field.kind === 'object' ? foreignKeyOf(model, field, models) : null
        const misplaced =
          field.kind === 'object'
            ? calls.flatMap((call) => relationCallProblems(call.name, key?.side))
            : scalarCallsProblems(field, calls, cast, foreignKeys)
        return [...problems, ...misplaced].map(
          (problem) => `field ${model.name}.${field.name}: ${problem}`,
        )
      }),
    ]
  })
}

// The table and the columns of a constraint, as Prisma joins them before its suffix.
function constraintBase(owner: DMMF.Model, fields: readonly string[]) {
  return [owner.dbName ?? owner.name, ...fields.map((name) => fieldColumn(owner, name))].join('_')
}

// Whether an `@ecto.` line gives an option itself: the keyword, not the word inside a string.
function hasOption(args: string, option: string) {
  return new RegExp(`(?:^|,)\\s*${option}:`, 'u').test(args.replaceAll(/"(?:[^"\\]|\\.)*"/gu, '""'))
}

// A call's first argument and the ones an `@ecto.` line wrote after it.
function withArgs(first: string, args: string) {
  return args === '' ? first : `${first}, ${args}`
}

// The length in bytes of a name each database takes, which Prisma cuts the names it derives to.
const IDENTIFIER_LIMITS: { readonly [provider: string]: number } = {
  postgresql: 63,
  cockroachdb: 63,
  mysql: 64,
  sqlserver: 128,
}

// The words Elixir will not take as a variable name.
const ELIXIR_RESERVED = new Set([
  'true',
  'false',
  'nil',
  'when',
  'and',
  'or',
  'not',
  'in',
  'fn',
  'do',
  'end',
  'catch',
  'rescue',
  'after',
  'else',
])

/**
 * The `changeset/2` of a model with an `@ecto` line on it or on one of its fields: every cast
 * field, the required ones Prisma gives no default, what the `@ecto.` lines ask, a
 * `unique_constraint` for each unique key and a `foreign_key_constraint` for each foreign key.
 * A constraint carries the name the database reports, as Prisma Migrate names it
 * (`<table>_<columns>_key`, `<table>_<columns>_fkey`, cut to the database's limit, or the `map:`
 * given). On SQLite ecto_sqlite3 names a violated index `<table>_<columns>_index`, the name Ecto
 * derives itself, and names no foreign key at all, so a unique key goes unnamed and a foreign key
 * gets no constraint.
 *
 * @example
 * ```elixir
 * def changeset(post, attrs) do
 *   post
 *   |> cast(attrs, [:slug, :author_id])
 *   |> validate_required([:slug, :author_id])
 *   |> validate_length(:slug, max: 80)
 *   |> unique_constraint(:slug, name: "posts_slug_key")
 *   |> foreign_key_constraint(:author_id, name: "posts_author_id_fkey")
 * end
 * ```
 */
// The name the database reports, unless the line gives one (not the word inside a message),
// or the database is SQLite.
function withConstraintName(args: string, name: string, provider: string | undefined) {
  if (provider === 'sqlite' || hasOption(args, 'name')) return args
  return args === '' ? `name: ${toElixirString(name)}` : `${args}, name: ${toElixirString(name)}`
}

function changesetLines(model: DMMF.Model, allModels: readonly DMMF.Model[], options: EctoOptions) {
  const { provider } = options
  const modelCalls = ectoCalls(model.documentation)
  const cast = castFields(model).map((f) => ({
    field: f,
    atom: `:${makeSnakeCase(f.name)}`,
    calls: ectoCalls(f.documentation).calls,
  }))
  if (!(modelCalls.annotated || model.fields.some((f) => ectoCalls(f.documentation).annotated))) {
    return []
  }

  const limit = IDENTIFIER_LIMITS[provider ?? ''] ?? Infinity
  const uniqueName = (fields: readonly string[]) =>
    (options.indexes ?? []).find(
      (idx) =>
        idx.model === model.name &&
        idx.type === 'unique' &&
        idx.fields.length === fields.length &&
        idx.fields.every((f, i) => f.name === fields[i]),
    )?.dbName ?? prismaConstraintName(constraintBase(model, fields), '_key', limit)
  const foreignKeyName = (owner: DMMF.Model, holder: DMMF.Field) =>
    options.foreignKeyNames?.get(`${owner.name}.${holder.name}`) ??
    prismaConstraintName(constraintBase(owner, holder.relationFromFields ?? []), '_fkey', limit)
  const named = (args: string, name: string) => withConstraintName(args, name, provider)

  const ownRequired = new Set(
    cast
      .filter((c) => c.calls.find((call) => call.name === 'validate_required'))
      .map((c) => c.atom),
  )
  const required = cast
    .filter(
      (c) =>
        c.field.isRequired &&
        !c.field.isList &&
        !c.field.hasDefaultValue &&
        c.field.isUpdatedAt !== true &&
        !ownRequired.has(c.atom),
    )
    .map((c) => c.atom)

  const fieldSteps = cast.flatMap((c) =>
    c.calls
      .filter((call) => call.name !== 'unique_constraint' && call.name !== 'foreign_key_constraint')
      .map((call) =>
        call.name === 'validate_required'
          ? `validate_required(${withArgs(`[${c.atom}]`, call.args)})`
          : `${call.name}(${withArgs(c.atom, call.args)})`,
      ),
  )

  // A model's `unique_constraint([:a, :b], message: "...")` on the fields of a @@unique is that
  // constraint's, and takes its place with the name the database reports.
  const compoundOwn = (fields: readonly string[]) =>
    modelCalls.calls.find(
      (call) =>
        call.name === 'unique_constraint' &&
        call.args.match(/^\[([^\]]*)\]/u)?.[1]?.replaceAll(/\s/gu, '') ===
          fields.map((f) => `:${makeSnakeCase(f)}`).join(','),
    )
  const uniqueSteps = [
    ...cast
      .filter((c) => c.field.isUnique && !c.field.isId)
      .map(
        (c) =>
          `unique_constraint(${withArgs(
            c.atom,
            named(
              c.calls.find((call) => call.name === 'unique_constraint')?.args ?? '',
              uniqueName([c.field.name]),
            ),
          )})`,
      ),
    // A @@unique on a single column arrives on the field as isUnique, and is written there.
    ...model.uniqueFields
      .filter((fields) => fields.length > 1)
      .map(
        (fields) =>
          `unique_constraint(${withArgs(
            `[${fields.map((f) => `:${makeSnakeCase(f)}`).join(', ')}]`,
            named(
              compoundOwn(fields)?.args.replace(/^\[[^\]]*\]\s*,?\s*/u, '') ?? '',
              uniqueName(fields),
            ),
          )})`,
      ),
  ]

  // A foreign key the database checks is a `foreign_key_constraint` on its first column, or the
  // `assoc_constraint` its relation field asks for, which puts the error on the association.
  // With `relationMode = "prisma"` there is no foreign key in the database to report one.
  const relationFields = model.fields.filter((f) => f.kind === 'object')
  const fieldsByName = new Map(model.fields.map((f) => [f.name, f]))
  const keySteps = relationFields.flatMap((field) => {
    const first = field.relationFromFields?.[0]
    if (first === undefined) return []
    const name = foreignKeyName(model, field)
    const assoc = ectoCalls(field.documentation).calls.find(
      (call) => call.name === 'assoc_constraint',
    )
    // Ecto has no association for a key of several columns: the same constraint, with the error
    // on the relation's name, is a foreign_key_constraint.
    if (assoc) {
      return [
        `${field.relationFromFields?.length === 1 ? 'assoc_constraint' : 'foreign_key_constraint'}(${withArgs(`:${makeSnakeCase(field.name)}`, named(assoc.args, name))})`,
      ]
    }
    const own = ectoCalls(fieldsByName.get(first)?.documentation).calls.find(
      (call) => call.name === 'foreign_key_constraint',
    )
    return own || (provider !== 'sqlite' && options.relationMode !== 'prisma')
      ? [
          `foreign_key_constraint(${withArgs(`:${makeSnakeCase(first)}`, named(own?.args ?? '', name))})`,
        ]
      : []
  })
  // A has_one or has_many whose rows the database will not let go of — their key is Restrict or
  // NoAction on delete, which Prisma makes of a required relation that names neither — refuses
  // the delete of this row: `no_assoc_constraint` turns that into an error on the association.
  // Cascade and SetNull refuse nothing; a line asks for one anyway. A key of several columns has
  // no association in Ecto, so it is a foreign_key_constraint on the relation's name, with the
  // message Ecto gives one unless the line gives its own.
  const inverseSteps = relationFields.flatMap((field) => {
    const call = ectoCalls(field.documentation).calls.find((c) => c.name === 'no_assoc_constraint')
    const key = foreignKeyOf(model, field, allModels)
    if (key?.side !== 'inverse') return []
    const { onDelete } = referentialActions(key.holder)
    const refused =
      (onDelete === 'Restrict' || onDelete === 'NoAction') &&
      provider !== 'sqlite' &&
      options.relationMode !== 'prisma'
    if (!(call || refused)) return []
    const name = foreignKeyName(key.owner, key.holder)
    const atom = `:${makeSnakeCase(field.name)}`
    if (key.holder.relationFromFields?.length === 1) {
      return [`no_assoc_constraint(${withArgs(atom, named(call?.args ?? '', name))})`]
    }
    return [`foreign_key_constraint(${withArgs(atom, named(call?.args ?? '', name))})`]
  })

  const compoundCalls = new Set(model.uniqueFields.map(compoundOwn))
  const castOptions = modelCalls.calls
    .filter((call) => call.name === 'cast')
    .map((call) => call.args)
    .filter((args) => args !== '')
  const modelSteps = modelCalls.calls
    .filter((call) => call.name !== 'cast' && !compoundCalls.has(call))
    .map((call) => (call.args === '' ? call.name : `${call.name}(${call.args})`))

  const snake = makeSnakeCase(model.name)
  // Not a word Elixir reserves, and not the attrs it is given alongside.
  const subject = ELIXIR_RESERVED.has(snake) || snake === 'attrs' ? `${snake}_struct` : snake
  // With empty values of the cast line's own, "" is what the user sent and a value the database
  // takes: a required column refuses NULL and nothing else, so a field is missing when it is nil.
  // validate_required would still count "" as missing.
  const notNull = castOptions.some((args) => hasOption(args, 'empty_values'))
  const steps = [
    `cast(${['attrs', `[${cast.map((c) => c.atom).join(', ')}]`, ...castOptions].join(', ')})`,
    ...(required.length > 0
      ? [`${notNull ? 'validate_not_null' : 'validate_required'}([${required.join(', ')}])`]
      : []),
    ...fieldSteps,
    ...uniqueSteps,
    ...keySteps,
    ...inverseSteps,
    ...modelSteps,
  ]
  return [
    '',
    '  @spec changeset(t(), map()) :: Ecto.Changeset.t()',
    `  def changeset(${subject}, attrs) do`,
    `    ${subject}`,
    ...steps.map((step) => `    |> ${step}`),
    '  end',
    ...(notNull && required.length > 0
      ? [
          '',
          '  defp validate_not_null(changeset, fields) do',
          '    changeset = %{changeset | required: Enum.uniq(changeset.required ++ fields)}',
          '',
          '    Enum.reduce(fields, changeset, fn field, acc ->',
          '      if is_nil(get_field(acc, field)) and not Keyword.has_key?(acc.errors, field),',
          '        do: add_error(acc, field, "can\'t be blank", validation: :required),',
          '        else: acc',
          '    end)',
          '  end',
        ]
      : []),
  ]
}

/** The prose of a `///` comment as `#` lines above a line of the schema block. */
function ectoLineComments(text: string | undefined) {
  if (text === undefined) return []
  return text.split('\n').map((line) => (line === '' ? '    #' : `    # ${line}`))
}

/**
 * The prose of a model's `///` comment as its `@moduledoc` heredoc. A heredoc interpolates and
 * reads escapes, so a backslash, a `#{` and a `"""` in the text are escaped.
 */
function ectoModuledoc(text: string | undefined) {
  if (text === undefined) return []
  const body = text
    .replaceAll('\\', '\\\\')
    .replaceAll('#{', '\\#{')
    .replaceAll('"""', '\\"""')
    .split('\n')
    .map((line) => (line === '' ? '' : `  ${line}`))
  return ['  @moduledoc """', ...body, '  """', '']
}

type EctoOptions = {
  readonly provider?: string
  readonly indexes?: readonly DMMF.Index[]
  readonly foreignKeyNames?: ReadonlyMap<string, string>
  readonly relationMode?: string
}

type EctoAssociations = ReturnType<typeof getAssociations>
type EctoPrimaryKey = ReturnType<typeof getPrimaryKeyConfig>
type EnumValues = ReadonlyMap<string, readonly DMMF.DatamodelEnum['values'][number][]>

const NO_PRIMARY_KEY: EctoPrimaryKey = {
  line: '@primary_key false',
  typeSpec: '',
  omitIdFieldInSchema: false,
  foreignKeyType: null,
}

// The Ecto type of a scalar field, by its Prisma type and the column Prisma makes of it.
function scalarEctoType(f: DMMF.Field, modulePrefix: string) {
  if (f.type === 'DateTime') return `${modulePrefix}${dateTimeModule(f)}`
  if (f.type === 'Json') return `${modulePrefix}PrismaJson`
  return isUuidColumn(f) ? 'Ecto.UUID' : prismaTypeToEctoType(f.type)
}

function typeSpecField(f: DMMF.Field) {
  const nullSuffix = f.isRequired ? '' : ' | nil'
  if (f.kind === 'enum') {
    return `${makeSnakeCase(f.name)}: atom()${nullSuffix}`
  }
  const baseTypeSpec = ectoTypeToTypespec(scalarEctoType(f, ''))
  const typeSpec = f.isList ? `[${baseTypeSpec}]` : baseTypeSpec
  return `${makeSnakeCase(f.name)}: ${typeSpec}${nullSuffix}`
}

function typeSpecLines(
  appName: string,
  pk: EctoPrimaryKey,
  keyFieldNames: ReadonlySet<string>,
  schemaFields: readonly DMMF.Field[],
  timestampTypes: readonly string[],
  associations: EctoAssociations,
) {
  const keyFkTypeSpecs = associations.belongsTo
    .filter((a) => keyFieldNames.has(a.foreignKey))
    .map((a) => {
      const snakeFk = makeSnakeCase(a.foreignKey)
      const fkType = a.fkType ?? 'id'
      return `${snakeFk}: ${fkType === 'id' ? 'integer()' : ectoTypeToTypespec(fkType)}`
    })
  const typeSpecFields = [
    ...(pk.omitIdFieldInSchema ? [`id: ${pk.typeSpec}`] : []),
    ...keyFkTypeSpecs,
    ...schemaFields.map(typeSpecField),
    ...timestampTypes,
    ...associations.belongsTo.map(
      (a) => `${makeSnakeCase(a.name)}: ${appName}.${makePascalCase(a.targetModel)}.t() | nil`,
    ),
    ...associations.hasOne.map(
      (a) => `${makeSnakeCase(a.name)}: ${appName}.${makePascalCase(a.targetModel)}.t() | nil`,
    ),
    ...associations.hasMany.map(
      (a) => `${makeSnakeCase(a.name)}: [${appName}.${makePascalCase(a.targetModel)}.t()]`,
    ),
    ...associations.manyToMany.map(
      (a) => `${makeSnakeCase(a.name)}: [${appName}.${makePascalCase(a.targetModel)}.t()]`,
    ),
  ]
  return [
    '  @type t :: %__MODULE__{',
    ...typeSpecFields.map((line, i) => {
      const isLast = i === typeSpecFields.length - 1
      return `          ${line}${isLast ? '' : ','}`
    }),
    '        }',
  ]
}

function enumSchemaFieldLines(
  f: DMMF.Field,
  snakeName: string,
  sourceOpt: string,
  values: readonly DMMF.DatamodelEnum['values'][number][],
) {
  // @map-ped values need the keyword form (atom -> dump value) so
  // Ecto dumps the database value, not the atom's own name.
  const hasMappedValue = values.some((v) => (v.dbName ?? v.name) !== v.name)
  const valuesStr = hasMappedValue
    ? values.map((v) => `${v.name}: "${v.dbName ?? v.name}"`).join(', ')
    : values.map((v) => `:${v.name}`).join(', ')
  const enumType = f.isList ? '{:array, Ecto.Enum}' : 'Ecto.Enum'
  const enumDefault = typeof f.default === 'string' ? `, default: :${f.default}` : ''
  return [
    ...ectoLineComments(stripAnnotations(f.documentation)),
    `    field(:${snakeName}, ${enumType}, values: [${valuesStr}]${enumDefault}${sourceOpt})`,
  ]
}

function schemaFieldLines(
  f: DMMF.Field,
  keyFieldNames: ReadonlySet<string>,
  enumMap: EnumValues,
  appName: string,
) {
  const snakeName = makeSnakeCase(f.name)
  const dbColumnName = f.dbName ?? f.name
  const sourceOpt = snakeName !== dbColumnName ? `, source: :${dbColumnName}` : ''
  if (f.kind === 'enum') {
    return enumSchemaFieldLines(f, snakeName, sourceOpt, enumMap.get(f.type) ?? [])
  }
  const primary = keyFieldNames.has(f.name) ? ', primary_key: true' : ''
  const type = formatEctoType(scalarEctoType(f, `${appName}.`))
  const ectoType = f.isList ? `{:array, ${type}}` : type
  const defaultOpt = ectoDefaultOption(f)
  const defaultClause = defaultOpt === null ? '' : `, ${defaultOpt}`
  return [
    ...ectoLineComments(stripAnnotations(f.documentation)),
    `    field(:${snakeName}, ${ectoType}${primary}${defaultClause}${sourceOpt})`,
  ]
}

// A belongs_to's key as a field: where it maps another column, is the primary key or part of it, or
// has a default (belongs_to takes no :default), it is a field of its own and belongs_to does not
// define it.
function belongsToKey(
  a: EctoAssociations['belongsTo'][number],
  fkField: DMMF.Field | undefined,
  isPkField: boolean,
) {
  const snakeFk = makeSnakeCase(a.foreignKey)
  const fkDbName = fkField?.dbName ?? a.foreignKey
  const needsSource = snakeFk !== fkDbName
  const defaultOpt = fkField === undefined ? null : ectoDefaultOption(fkField)
  return {
    snakeFk,
    fkDbName,
    needsSource,
    isPkField,
    defaultOpt,
    definesField: !(needsSource || isPkField || defaultOpt !== null),
    prose: stripAnnotations(fkField?.documentation),
  }
}

type BelongsToKey = ReturnType<typeof belongsToKey>

function keyFieldLines(a: EctoAssociations['belongsTo'][number], key: BelongsToKey) {
  if (key.definesField) return []
  const fkType = a.fkType ?? 'id'
  const pkOpt = key.isPkField ? ', primary_key: true' : ''
  const defaultClause = key.defaultOpt === null ? '' : `, ${key.defaultOpt}`
  const sourceOpt = key.needsSource ? `, source: :${key.fkDbName}` : ''
  return [
    ...ectoLineComments(key.prose),
    `    field(:${key.snakeFk}, ${formatEctoType(fkType)}${pkOpt}${defaultClause}${sourceOpt})`,
  ]
}

function belongsToLines(
  a: EctoAssociations['belongsTo'][number],
  key: BelongsToKey,
  pk: EctoPrimaryKey,
  appName: string,
  comments: readonly string[],
) {
  const opts: string[] = [`foreign_key: :${key.snakeFk}`]
  if (!key.definesField) opts.push('define_field: false')
  // A module's @foreign_key_type reaches every belongs_to in it: one whose key is of
  // Ecto's default :id type says so where the module's default is another.
  if ((a.fkType ?? 'id') !== (pk.foreignKeyType ?? 'id')) {
    opts.push(`type: ${formatEctoType(a.fkType ?? 'id')}`)
  }
  if (a.references !== 'id') opts.push(`references: :${a.references}`)
  // Where belongs_to defines the key's field, the key's comment is written above it.
  return [
    ...(key.definesField ? ectoLineComments(key.prose) : []),

    ...comments,
    `    belongs_to(:${makeSnakeCase(a.name)}, ${appName}.${makePascalCase(a.targetModel)}, ${opts.join(', ')})`,
  ]
}

// A has_one or has_many reads the key it references from @primary_key unless it is named,
// and Ecto raises where that is false, as it is for a key declared with
// `field(..., primary_key: true)`: there `references:` is always written.
function ownedAssociationLines(
  macro: 'has_one' | 'has_many',
  a: EctoAssociations['hasOne'][number],
  pk: EctoPrimaryKey,
  appName: string,
  comments: readonly string[],
) {
  const namesReferences = a.references !== 'id' || pk.line === '@primary_key false'
  const referencesOpt = namesReferences ? `, references: :${a.references}` : ''
  return [
    ...comments,
    `    ${macro}(:${makeSnakeCase(a.name)}, ${appName}.${makePascalCase(a.targetModel)}, foreign_key: :${makeSnakeCase(a.foreignKey)}${referencesOpt})`,
  ]
}

function manyToManyLines(
  a: EctoAssociations['manyToMany'][number],
  appName: string,
  comments: readonly string[],
) {
  // Prisma implicit m2m join tables use columns "A"/"B" (models in
  // alphabetical order), not Ecto's inflected <schema>_id defaults.
  const joinKeys = `join_keys: [${a.ownJoinColumn}: :${a.ownKey}, ${a.relatedJoinColumn}: :${a.relatedKey}]`
  return [
    ...comments,
    `    many_to_many(:${makeSnakeCase(a.name)}, ${appName}.${makePascalCase(a.targetModel)}, join_through: "${a.joinThrough}", ${joinKeys})`,
  ]
}

type EctoContext = {
  readonly appName: string
  readonly contextModels: readonly DMMF.Model[]
  readonly enumMap: EnumValues
  readonly options: EctoOptions
}

function ectoSchema(model: DMMF.Model, ctx: EctoContext) {
  const { appName } = ctx
  // A model with no @id or @@id is keyed by its first unique fields, as a composite key is,
  // so the associations of the other models that name it have a schema to load.
  const idField = model.fields.find((f) => f.isId)
  const pk = idField ? getPrimaryKeyConfig(idField) : NO_PRIMARY_KEY
  // The fields that are the key where @primary_key declares none: an @id Ecto does not generate,
  // or each field of a composite key. Each is a `field(..., primary_key: true)`, a foreign key
  // among them too, or Ecto sees no primary key and refuses to update or delete a row.
  const idKeyFieldNames = idField && !pk.omitIdFieldInSchema ? [idField.name] : []
  const keyFieldNames = new Set(idField ? idKeyFieldNames : primaryKeyFields(model))
  const fields = model.fields.map((f) => ({ ...f }))
  const fieldsByName = new Map(fields.map((f) => [f.name, f]))
  const timestamps = makeTimestampsLines(fields, appName)
  const associations = getAssociations(model, ctx.contextModels, appName)

  const belongsToFkFields = new Set(associations.belongsTo.map((a) => a.foreignKey))

  const schemaFieldsRaw = fields.filter(
    (f) =>
      !(
        f.relationName !== undefined ||
        (f.isId && pk.omitIdFieldInSchema) ||
        timestamps.exclude.has(f.name) ||
        belongsToFkFields.has(f.name)
      ),
  )

  const keys = associations.belongsTo.map((a) => ({
    a,
    key: belongsToKey(a, fieldsByName.get(a.foreignKey), keyFieldNames.has(a.foreignKey)),
  }))

  // The prose of a relation field, above the association it becomes.
  const relationComments = (name: string) =>
    ectoLineComments(stripAnnotations(fieldsByName.get(name)?.documentation))

  const changeset = changesetLines(model, ctx.contextModels, ctx.options)
  const lines = [
    `defmodule ${appName}.${makePascalCase(model.name)} do`,
    ...ectoModuledoc(stripAnnotations(model.documentation)),
    '  use Ecto.Schema',
    ...(changeset.length > 0 ? ['  import Ecto.Changeset'] : []),
    '',
    `  ${pk.line}`,
    ...(pk.foreignKeyType === null
      ? []
      : [`  @foreign_key_type ${formatEctoType(pk.foreignKeyType)}`]),
    ...(timestamps.attribute === null ? [] : [timestamps.attribute]),
    '',
    ...typeSpecLines(appName, pk, keyFieldNames, schemaFieldsRaw, timestamps.types, associations),
    '',
    `  schema "${model.dbName ?? model.name}" do`,
    ...schemaFieldsRaw.flatMap((f) => schemaFieldLines(f, keyFieldNames, ctx.enumMap, appName)),
    ...keys.flatMap(({ a, key }) => keyFieldLines(a, key)),
    ...keys.flatMap(({ a, key }) => belongsToLines(a, key, pk, appName, relationComments(a.name))),
    ...associations.hasOne.flatMap((a) =>
      ownedAssociationLines('has_one', a, pk, appName, relationComments(a.name)),
    ),
    ...associations.hasMany.flatMap((a) =>
      ownedAssociationLines('has_many', a, pk, appName, relationComments(a.name)),
    ),
    ...associations.manyToMany.flatMap((a) =>
      manyToManyLines(a, appName, relationComments(a.name)),
    ),
    ...timestamps.lines,
    '  end',
    ...changeset,
    'end',
  ]

  return lines.join('\n')
}

export function ectoSchemas(
  models: readonly DMMF.Model[],
  app: string | string[],
  allModels?: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
  options: EctoOptions = {},
) {
  const ctx: EctoContext = {
    appName: Array.isArray(app) ? app.join('.') : app,
    contextModels: allModels ?? models,
    enumMap: new Map((enums ?? []).map((e) => [e.name, [...e.values]])),
    options,
  }
  return models
    .map((model) => ectoSchema(model, ctx))
    .filter(Boolean)
    .join('\n\n')
}

/**
 * The types a schema keeps a DateTime in, written beside the schemas, the ones `modules` names:
 * each reads and writes a value as Prisma Client does, and a query binds a value through the same
 * `dump/1` a write does. Ecto's own types do not: `:utc_datetime` cuts Prisma's milliseconds and
 * refuses microseconds, and on SQLite `ecto_sqlite3` writes `2030-01-01T09:00:00Z` and reads an
 * offset as if it were UTC. SQLite compares that text, so Prisma's `where: { at }` missed Ecto's
 * rows, and Ecto's `where: at == ^at` Prisma's.
 *
 * `PrismaDateTime` is an instant in UTC in milliseconds: on SQLite the text Prisma writes
 * (`2030-01-01T09:00:00.000+00:00`), elsewhere the `DateTime` itself, which Postgrex and MyXQL
 * send as UTC. A value read is the instant Prisma reads: text with no zone is UTC, an offset is
 * honoured, a date alone is midnight UTC and digits are epoch milliseconds. `PrismaDate` is a
 * `@db.Date`, the UTC date of what it is given, and `PrismaTime` a `@db.Time` or `@db.Timetz`,
 * the UTC time of day in milliseconds, as Prisma writes them. Each has the `autogenerate/0` that
 * `now()` and `@updatedAt` are filled from.
 *
 * @param app - The module the schemas are under.
 * @param provider - The datasource's provider: SQLite is written as text, every other one as the
 * value.
 * @param modules - The types the schemas use.
 * @returns The Elixir source of the types, or an empty string when no schema has a DateTime.
 * @example
 * ```elixir
 * defmodule App.PrismaDateTime do
 *   use Ecto.Type
 *
 *   @impl true
 *   def type, do: :string
 *
 *   @impl true
 *   def dump(%DateTime{} = value) do
 *     {:ok, value |> utc() |> DateTime.to_iso8601() |> String.replace_suffix("Z", "+00:00")}
 *   end
 * end
 * ```
 */
export function ectoDateTypes(
  app: string,
  provider: string | undefined,
  modules: ReadonlySet<string>,
) {
  const sqlite = provider === 'sqlite'
  const dateTime = [
    `defmodule ${app}.PrismaDateTime do`,
    '  use Ecto.Type',
    '',
    '  @impl true',
    `  def type, do: ${sqlite ? ':string' : ':utc_datetime_usec'}`,
    '',
    '  @impl true',
    '  def cast(value) do',
    '    with {:ok, datetime} <- Ecto.Type.cast(:utc_datetime_usec, value), do: {:ok, utc(datetime)}',
    '  end',
    '',
    '  @impl true',
    '  def load(%DateTime{} = value), do: {:ok, utc(value)}',
    '  def load(%NaiveDateTime{} = value), do: {:ok, value |> DateTime.from_naive!("Etc/UTC") |> utc()}',
    '  def load(value) when is_integer(value), do: {:ok, value |> DateTime.from_unix!(:millisecond) |> utc()}',
    '',
    '  def load(value) when is_binary(value) do',
    '    value = String.replace(value, ~r/\\s+(?=[+-]\\d\\d:?\\d\\d\\z)/, "")',
    '',
    '    case DateTime.from_iso8601(value) do',
    '      {:ok, datetime, _offset} -> load(datetime)',
    '      {:error, :missing_offset} -> load(NaiveDateTime.from_iso8601!(value))',
    '      {:error, _} -> load_other(value)',
    '    end',
    '  end',
    '',
    '  def load(_), do: :error',
    '',
    '  @impl true',
    ...(sqlite
      ? [
          '  def dump(%DateTime{} = value) do',
          '    {:ok, value |> utc() |> DateTime.to_iso8601() |> String.replace_suffix("Z", "+00:00")}',
          '  end',
        ]
      : ['  def dump(%DateTime{} = value), do: {:ok, utc(value)}']),
    '',
    '  def dump(_), do: :error',
    '',
    '  @impl true',
    '  def equal?(%DateTime{} = left, %DateTime{} = right), do: DateTime.compare(left, right) == :eq',
    '  def equal?(left, right), do: left == right',
    '',
    // Ecto calls this once to a `timestamps()` and once to an `autogenerate: true` field, all in
    // the process that inserts and microseconds apart: a call within a millisecond of the one
    // that read the clock is given its value, so the fields of one insert hold one instant.
    '  @impl true',
    '  def autogenerate do',
    '    called = System.monotonic_time(:microsecond)',
    '',
    '    case Process.get(__MODULE__) do',
    '      {read, now} when called - read < 1_000 ->',
    '        now',
    '',
    '      _ ->',
    '        now = utc(DateTime.utc_now())',
    '        Process.put(__MODULE__, {called, now})',
    '        now',
    '    end',
    '  end',
    '',
    '  defp load_other(value) do',
    '    cond do',
    '      value =~ ~r/\\A-?\\d+\\z/ -> load(String.to_integer(value))',
    '      match?({:ok, _}, Date.from_iso8601(value)) -> load(NaiveDateTime.new!(Date.from_iso8601!(value), ~T[00:00:00]))',
    '      true -> :error',
    '    end',
    '  end',
    '',
    '  defp utc(value) do',
    '    %DateTime{microsecond: {microsecond, _}} = datetime = DateTime.shift_zone!(value, "Etc/UTC")',
    '    %{datetime | microsecond: {div(microsecond, 1000) * 1000, 3}}',
    '  end',
    'end',
  ]
  const date = [
    `defmodule ${app}.PrismaDate do`,
    '  use Ecto.Type',
    '',
    '  @impl true',
    '  def type, do: :date',
    '',
    '  @impl true',
    '  def cast(%Date{} = value), do: {:ok, value}',
    '',
    '  def cast(value) do',
    '    case Ecto.Type.cast(:utc_datetime_usec, value) do',
    '      {:ok, datetime} -> {:ok, DateTime.to_date(datetime)}',
    '      _ -> Ecto.Type.cast(:date, value)',
    '    end',
    '  end',
    '',
    '  @impl true',
    '  def load(%Date{} = value), do: {:ok, value}',
    '  def load(_), do: :error',
    '',
    '  @impl true',
    '  def dump(%Date{} = value), do: {:ok, value}',
    '  def dump(_), do: :error',
    '',
    '  @impl true',
    '  def autogenerate, do: Date.utc_today()',
    'end',
  ]
  const time = [
    `defmodule ${app}.PrismaTime do`,
    '  use Ecto.Type',
    '',
    '  @impl true',
    '  def type, do: :time_usec',
    '',
    '  @impl true',
    '  def cast(%Time{} = value), do: {:ok, milliseconds(value)}',
    '',
    '  def cast(value) do',
    '    instant = if is_binary(value) and value =~ ~r/\\A\\d{2}:/, do: "1970-01-01T" <> value, else: value',
    '',
    '    case Ecto.Type.cast(:utc_datetime_usec, instant) do',
    '      {:ok, datetime} -> {:ok, datetime |> DateTime.to_time() |> milliseconds()}',
    '      _ -> with {:ok, time} <- Ecto.Type.cast(:time_usec, value), do: {:ok, milliseconds(time)}',
    '    end',
    '  end',
    '',
    '  @impl true',
    '  def load(%Time{} = value), do: {:ok, milliseconds(value)}',
    '  def load(_), do: :error',
    '',
    '  @impl true',
    '  def dump(%Time{} = value), do: {:ok, milliseconds(value)}',
    '  def dump(_), do: :error',
    '',
    '  @impl true',
    '  def autogenerate, do: milliseconds(Time.utc_now())',
    '',
    '  defp milliseconds(%Time{microsecond: {microsecond, _}} = time) do',
    '    %{time | microsecond: {div(microsecond, 1000) * 1000, 3}}',
    '  end',
    'end',
  ]
  return [
    ...(modules.has('PrismaDateTime') ? [dateTime.join('\n')] : []),
    ...(modules.has('PrismaDate') ? [date.join('\n')] : []),
    ...(modules.has('PrismaTime') ? [time.join('\n')] : []),
  ].join('\n\n')
}

// The application whose `:json_library` a provider's adapter encodes JSON with, where the type has
// to send JSON text.
const JSON_LIBRARY_APPS: ReadonlyMap<string, string> = new Map([
  ['sqlite', ':ecto_sqlite3'],
  ['mysql', ':myxql'],
])

/**
 * The type a schema keeps a Json in, written beside the schemas. A Json column holds any JSON
 * value, and Ecto's `:map` loads an object only: a row holding an array, a string, a number or a
 * boolean, as Prisma Client writes them, could not be read. A string is cast as a JSON string, as
 * Prisma Client takes it.
 *
 * On PostgreSQL and CockroachDB its `type/0` is `:map`: Postgrex decodes the column into any JSON
 * value and encodes the value sent. On SQLite and MySQL it is `:string`, kept out of the adapters'
 * `:map` loader, and the type reads and writes the JSON text with the adapter's own JSON library:
 * Prisma's `JSONB` column on SQLite has NUMERIC affinity, so SQLite keeps the text of a number as
 * an INTEGER or a REAL (a `1.0` comes back as `1`), which `ecto_sqlite3`'s `:map` loader refuses;
 * MySQL's JSON column is decoded by MyXQL already, and the `:map` loader decoded a string a second
 * time, while MariaDB's is text. A string MyXQL gives that is not JSON text is a JSON string.
 *
 * @param app - The module the schemas are under.
 * @param provider - The datasource's provider: SQLite and MySQL are sent JSON text, every other one
 * the value.
 * @returns The Elixir source of the type.
 * @example
 * ```elixir
 * defmodule App.PrismaJson do
 *   use Ecto.Type
 *
 *   defguardp is_json(value)
 *             when is_map(value) or is_list(value) or is_binary(value) or is_number(value) or
 *                    is_boolean(value)
 *
 *   @impl true
 *   def type, do: :map
 * end
 * ```
 */
export function ectoJsonType(app: string, provider: string | undefined) {
  const library = JSON_LIBRARY_APPS.get(provider ?? '')
  if (library === undefined) {
    return [
      ...jsonTypeHead(app, ':map'),
      '  @impl true',
      '  def load(value) when is_json(value), do: {:ok, value}',
      '  def load(_), do: :error',
      '',
      '  @impl true',
      '  def dump(value) when is_json(value), do: {:ok, value}',
      '  def dump(_), do: :error',
      'end',
    ].join('\n')
  }
  const json = `Application.get_env(${library}, :json_library, Jason)`
  return [
    ...jsonTypeHead(app, ':string'),
    '  @impl true',
    ...(provider === 'sqlite'
      ? [
          '  def load(value) when is_number(value), do: {:ok, value}',
          '',
          '  def load(value) when is_binary(value) do',
          `    case ${json}.decode(value) do`,
          '      {:ok, json} -> {:ok, json}',
          '      _ -> :error',
          '    end',
          '  end',
          '',
          '  def load(_), do: :error',
        ]
      : [
          '  def load(value) when is_binary(value) do',
          `    case ${json}.decode(value) do`,
          '      {:ok, json} -> {:ok, json}',
          '      _ -> {:ok, value}',
          '    end',
          '  end',
          '',
          '  def load(value) when is_json(value), do: {:ok, value}',
          '  def load(_), do: :error',
        ]),
    '',
    '  @impl true',
    '  def dump(value) when is_json(value) do',
    `    case ${json}.encode(value) do`,
    '      {:ok, text} -> {:ok, text}',
    '      _ -> :error',
    '    end',
    '  end',
    '',
    '  def dump(_), do: :error',
    'end',
  ].join('\n')
}

// What every PrismaJson starts with: the module, its primitive type and a cast of any JSON value.
function jsonTypeHead(app: string, type: string) {
  return [
    `defmodule ${app}.PrismaJson do`,
    '  use Ecto.Type',
    '',
    '  defguardp is_json(value)',
    '            when is_map(value) or is_list(value) or is_binary(value) or is_number(value) or',
    '                   is_boolean(value)',
    '',
    '  @impl true',
    `  def type, do: ${type}`,
    '',
    '  @impl true',
    '  def cast(value) when is_json(value), do: {:ok, value}',
    '  def cast(_), do: :error',
    '',
  ]
}
