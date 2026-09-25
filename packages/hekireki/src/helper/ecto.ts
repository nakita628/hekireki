import type { DMMF } from '@prisma/generator-helper'

import {
  isAnnotationLine,
  makePascalCase,
  makeSnakeCase,
  stripAnnotations,
} from '../utils/index.js'
import { prismaConstraintName } from '../utils/prisma-postgres.js'

/**
 * The Ecto type of a scalar Prisma type. A DateTime is not one of Ecto's own: it is kept in one of
 * the types `ectoDateTypes` writes beside the schemas, which `dateTimeModule` names.
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

// What each of the DateTime types holds, as a typespec.
const DATE_TIME_TYPESPECS: ReadonlyMap<string, string> = new Map([
  ['PrismaDateTime', 'DateTime.t()'],
  ['PrismaDate', 'Date.t()'],
  ['PrismaTime', 'Time.t()'],
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

/** The DateTime columns of a model, which are kept in the types `ectoDateTypes` writes. */
export function dateTimeFields(model: DMMF.Model) {
  return model.fields.filter((f) => f.kind === 'scalar' && f.type === 'DateTime')
}

export function ectoTypeToTypespec(type: string) {
  // A DateTime type is named with the app's module in front of it.
  const dateTime = DATE_TIME_TYPESPECS.get(type.split('.').at(-1) ?? '')
  if (dateTime) return dateTime
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

// Ecto type references are atoms (:binary_id) or modules (Ecto.ULID).
function formatEctoType(type: string) {
  return /^[A-Z]/u.test(type) ? type : `:${type}`
}

function getPrimaryKeyConfig(field: DMMF.Field) {
  const def = field.default
  const isFunctionDefault = def && typeof def === 'object' && 'name' in def
  // @primary_key always declares the :id field; when the actual column
  // (@map / a differently named @id field) is not "id", map it via :source.
  const pkColumn = field.dbName ?? field.name
  const sourceOpt = pkColumn === 'id' ? '' : `, source: :${pkColumn}`

  if (field.type === 'String' && isFunctionDefault && def.name === 'uuid') {
    const isV7 = 'args' in def && def.args[0] === 7
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

  // ULID PK: String + @default(ulid()) — requires the ecto_ulid_next package.
  if (field.type === 'String' && isFunctionDefault && def.name === 'ulid') {
    return {
      line: `@primary_key {:id, Ecto.ULID, autogenerate: true${sourceOpt}}`,
      typeSpec: 'Ecto.ULID.t()',
      omitIdFieldInSchema: true,
      foreignKeyType: 'Ecto.ULID',
    }
  }

  if (
    (field.type === 'Int' || field.type === 'BigInt') &&
    isFunctionDefault &&
    def.name === 'autoincrement'
  ) {
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

/**
 * The DateTime fields Prisma Client fills itself, as `timestamps()` calls, which fill them the same
 * way: on insert when the caller gives none, and an `updated_at` on every update that changes
 * something, each from its type's `autogenerate/0`. A `createdAt` (or `created_at`,
 * `inserted_at`) with `@default(now())` is Ecto's `inserted_at` and the first `@updatedAt` its
 * `updated_at`, in one call when they are of one type, so an insert gives them one time. Each
 * other `@updatedAt` is a call of its own with no `inserted_at`, as a schema can have one
 * `updated_at` to a call. A field keeps its own name where Ecto's is taken by another field.
 *
 * The type most of them have, `PrismaDateTime`, is `@timestamps_opts` (`attribute`); a call for
 * a `@db.Date` or `@db.Time` names its own.
 *
 * @example
 * ```elixir
 * @timestamps_opts [type: App.PrismaDateTime, autogenerate: {App.PrismaDateTime, :autogenerate, []}]
 *
 * timestamps(inserted_at_source: :createdAt, updated_at_source: :updatedAt)
 * timestamps(inserted_at: false, updated_at: :synced_at, updated_at_source: :syncedAt)
 * ```
 */
function makeTimestampsLines(fields: readonly DMMF.Field[], appName: string) {
  const insertedAliases = new Set(['inserted_at', 'created_at', 'createdAt'])
  const stamped = (f: DMMF.Field) => f.kind === 'scalar' && f.type === 'DateTime' && !f.isList
  const inserted = fields.find(
    (f) => stamped(f) && insertedAliases.has(f.name) && isNowDefault(f) && !f.isUpdatedAt,
  )
  const updated = fields.filter((f) => stamped(f) && f.isUpdatedAt)
  const exclude = new Set([...(inserted ? [inserted.name] : []), ...updated.map((f) => f.name)])
  // Ecto's name for the field, unless another field of the model has it.
  const named = (field: DMMF.Field, ecto: string) =>
    fields.some((f) => f !== field && makeSnakeCase(f.name) === ecto)
      ? makeSnakeCase(field.name)
      : ecto
  const options = (key: 'inserted_at' | 'updated_at', field: DMMF.Field, name: string) => {
    const source = field.dbName ?? field.name
    return [
      ...(name === key ? [] : [`${key}: :${name}`]),
      ...(source === name ? [] : [`${key}_source: :${source}`]),
    ]
  }
  const [first, ...others] = updated
  const together = inserted && first && dateTimeModule(inserted) === dateTimeModule(first)
  const calls = [
    ...(inserted
      ? [
          {
            module: dateTimeModule(inserted),
            options: [
              ...options('inserted_at', inserted, named(inserted, 'inserted_at')),
              ...(together ? options('updated_at', first, named(first, 'updated_at')) : []),
              ...(together ? [] : ['updated_at: false']),
            ],
          },
        ]
      : []),
    ...(first && !together
      ? [
          {
            module: dateTimeModule(first),
            options: ['inserted_at: false', ...options('updated_at', first, named(first, 'updated_at'))],
          },
        ]
      : []),
    ...others.map((field) => ({
      module: dateTimeModule(field),
      options: [
        'inserted_at: false',
        ...options('updated_at', field, named(field, makeSnakeCase(field.name))),
      ],
    })),
  ]
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

  if (pkConfig?.foreignKeyType) return pkConfig.foreignKeyType

  // Autoincrement integer PK → no explicit FK type needed (Ecto default :id)
  if (pkConfig?.line.includes(':id, autogenerate')) return null

  if (referenced.type === 'String') return 'string'
  if (referenced.type === 'DateTime') return `${appName}.${dateTimeModule(referenced)}`

  const ectoType = prismaTypeToEctoType(referenced.type)
  if (ectoType === 'integer') return null
  return ectoType
}

// The name Ecto knows a referenced field by: a primary key it declares with @primary_key is
// always :id, whatever the Prisma field or its column is called.
function ectoFieldName(model: DMMF.Model | undefined, fieldName: string) {
  const field = model?.fields.find((f) => f.name === fieldName)
  return field?.isId && getPrimaryKeyConfig(field).omitIdFieldInSchema
    ? 'id'
    : makeSnakeCase(fieldName)
}

function getAssociations(model: DMMF.Model, allModels: readonly DMMF.Model[], appName: string) {
  const belongsTo: {
    name: string
    targetModel: string
    foreignKey: string
    fkType: string | null
    references: string
  }[] = []
  const hasMany: { name: string; targetModel: string; foreignKey: string; references: string }[] =
    []
  const hasOne: { name: string; targetModel: string; foreignKey: string; references: string }[] = []
  const manyToMany: {
    name: string
    targetModel: string
    joinThrough: string
    ownJoinColumn: string
    ownKey: string
    relatedJoinColumn: string
    relatedKey: string
  }[] = []

  for (const field of model.fields) {
    if (field.kind !== 'object') continue

    if (field.relationFromFields && field.relationFromFields.length > 0) {
      // Ecto's belongs_to takes a single foreign_key: a composite FK would
      // half-join on the first column, so it emits no association and the FK
      // columns stay plain fields.
      if (field.relationFromFields.length > 1) continue
      belongsTo.push({
        name: field.name,
        targetModel: field.type,
        foreignKey: field.relationFromFields[0],
        fkType: getBelongsToFkType(allModels, field.type, field.relationToFields?.[0], appName),
        references: ectoFieldName(
          allModels.find((m) => m.name === field.type),
          field.relationToFields?.[0] ?? 'id',
        ),
      })
      continue
    }

    const targetModel = allModels.find((m) => m.name === field.type)
    if (!targetModel) continue

    if (field.isList) {
      const otherSide = targetModel.fields.find(
        (f) => f.relationName === field.relationName && f.kind === 'object' && f !== field,
      )
      if (otherSide?.isList) {
        // Prisma's join table holds the model that sorts first in "A". A model related to itself
        // is on both sides: the relation field whose name sorts first reads its own key from "A".
        const ownIsA =
          model.name === field.type ? field.name < otherSide.name : model.name < field.type
        const [left, right] = ownIsA ? [model.name, field.type] : [field.type, model.name]
        manyToMany.push({
          name: field.name,
          targetModel: field.type,
          joinThrough: `_${field.relationName ?? `${left}To${right}`}`,
          ownJoinColumn: ownIsA ? 'A' : 'B',
          ownKey: ectoFieldName(model, model.fields.find((f) => f.isId)?.name ?? 'id'),
          relatedJoinColumn: ownIsA ? 'B' : 'A',
          relatedKey: ectoFieldName(
            targetModel,
            targetModel.fields.find((f) => f.isId)?.name ?? 'id',
          ),
        })
        continue
      }
    }

    const fkField = targetModel.fields.find(
      (f) =>
        f.relationName === field.relationName &&
        f.relationFromFields &&
        f.relationFromFields.length > 0,
    )
    const foreignKey = fkField?.relationFromFields?.[0]
    if (!foreignKey) continue
    if ((fkField?.relationFromFields?.length ?? 0) > 1) continue

    const association = {
      name: field.name,
      targetModel: field.type,
      foreignKey,
      references: ectoFieldName(model, fkField?.relationToFields?.[0] ?? 'id'),
    }
    if (field.isList) {
      hasMany.push(association)
    } else {
      hasOne.push(association)
    }
  }

  return { belongsTo, hasMany, hasOne, manyToMany }
}

// The Ecto option a Prisma @default becomes, or null where Ecto has nothing to say.
function ectoDefaultOption(f: DMMF.Field) {
  const def = f.default
  const type = prismaTypeToEctoType(f.type)
  if (def === undefined || def === null) return null
  if (typeof def === 'object' && 'name' in def) {
    // now() is filled by Prisma's client, not left to the column's default (SQLite's
    // CURRENT_TIMESTAMP writes another form): the type's autogenerate/0 fills it on insert.
    if (def.name === 'now') return 'autogenerate: true'
    // A default the database applies (dbgenerated()): Ecto leaves a nil field out of the INSERT,
    // so the database fills it, and reads it back to have it on the struct.
    if (def.name === 'dbgenerated') return 'read_after_writes: true'
    // uuid() outside a primary key is made by Prisma's client, not the database: Ecto makes it
    // on insert. A string, as the column is, on every adapter.
    if (def.name === 'uuid') {
      return def.args[0] === 7
        ? 'autogenerate: {Ecto.UUID, :generate, [[version: 7]]}'
        : 'autogenerate: {Ecto.UUID, :generate, []}'
    }
    return null
  }
  if (typeof def === 'string') {
    // DMMF carries BigInt defaults as digit strings, DateTime literals
    // as ISO strings, and Json defaults as JSON text. Ecto validates
    // :default against the field type at compile time: :map takes an
    // Elixir map literal. A DateTime is the instant in UTC with
    // milliseconds, as Prisma's client holds it, whatever offset the
    // literal was written with; a date or a time of day is its UTC part.
    if (f.type === 'BigInt') return `default: ${def}`
    if (f.type === 'DateTime') {
      const iso = new Date(def).toISOString()
      const module = dateTimeModule(f)
      if (module === 'PrismaDate') return `default: ~D[${iso.slice(0, 10)}]`
      if (module === 'PrismaTime') return `default: ~T[${iso.slice(11, 23)}]`
      return `default: ~U[${iso.slice(0, 10)} ${iso.slice(11, 23)}Z]`
    }
    if (f.type === 'Json') {
      // Ecto's :map only accepts a map default; an array or scalar
      // Json default would fail schema compilation, so it stays a
      // database-level concern and is not emitted here.
      const parsed: unknown = JSON.parse(def)
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? `default: ${jsonToElixirLiteral(parsed)}`
        : null
    }
    return `default: ${toElixirString(def)}`
  }
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

function jsonToElixirLiteral(value: unknown): string {
  if (value === null) return 'nil'
  if (value === true) return 'true'
  if (value === false) return 'false'
  if (typeof value === 'number') return String(value)
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
  const holder = other?.fields.find(
    (f) =>
      f !== field &&
      f.relationName === field.relationName &&
      (f.relationFromFields?.length ?? 0) > 0,
  )
  return other && holder ? { side: 'inverse' as const, owner: other, holder } : null
}

/**
 * What keeps the schema's `@ecto.` comments from being read: a description written after the
 * calls, a call left open or in a shape that is not a call, a call on a field the changeset does
 * not cast, a function that does not take the field first, a `unique_constraint` on a field that
 * is not `@unique`, a `foreign_key_constraint` on a field that is not a foreign key, and on a
 * relation field anything but the `assoc_constraint` of the side with the key or the
 * `no_assoc_constraint` of the other, and a model named after a type a DateTime is kept in
 * (`PrismaDateTime`, `PrismaDate`, `PrismaTime`) where the schema has one. Each names the model or
 * field it is on.
 */
export function ectoProblems(models: readonly DMMF.Model[]) {
  const dateTypes = new Set<string>(
    models.flatMap((model) => dateTimeFields(model).map(dateTimeModule)),
  )
  return models.flatMap((model) => {
    if (dateTypes.has(makePascalCase(model.name))) {
      return [
        `model ${model.name}: its module is the one the generator writes to keep a DateTime in; rename the model, or @@map it to its table under another name`,
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
            ? calls.flatMap((call) =>
                call.name === 'assoc_constraint'
                  ? key?.side === 'owner'
                    ? []
                    : [
                        'assoc_constraint is on a relation whose foreign key is not a column of this model; it belongs on the side with the key',
                      ]
                  : call.name === 'no_assoc_constraint'
                    ? key?.side === 'inverse'
                      ? []
                      : [
                          'no_assoc_constraint is on a relation that is not a has_one or has_many; it belongs on the side the key points at',
                        ]
                    : [
                        `${call.name} is on a relation field, which takes assoc_constraint or no_assoc_constraint; write it as an @ecto. line on the model`,
                      ],
              )
            : calls.length > 0 && !cast.has(field.name)
              ? [
                  'an @ecto. call is on a field the changeset does not cast: a primary key Ecto generates, or a timestamp',
                ]
              : calls.flatMap((call) =>
                  !FIELD_FUNCTIONS.has(call.name)
                    ? [
                        `${call.name} is not an Ecto.Changeset function that takes the field first; write it as an @ecto. line on the model`,
                      ]
                    : call.name === 'unique_constraint' && !(field.isUnique || field.isId)
                      ? [
                          'unique_constraint is on a field that is not @unique; write a @@unique constraint as an @ecto. line on the model',
                        ]
                      : call.name === 'foreign_key_constraint' && !foreignKeys.has(field.name)
                        ? [
                            'foreign_key_constraint is on a field that is not the foreign key of a relation',
                          ]
                        : [],
                )
        return [...problems, ...misplaced].map(
          (problem) => `field ${model.name}.${field.name}: ${problem}`,
        )
      }),
    ]
  })
}

// The table and the columns of a constraint, as Prisma joins them before its suffix.
function constraintBase(owner: DMMF.Model, fields: readonly string[]) {
  return [
    owner.dbName ?? owner.name,
    ...fields.map((name) => owner.fields.find((f) => f.name === name)?.dbName ?? name),
  ].join('_')
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
function changesetLines(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  options: {
    readonly provider?: string
    readonly indexes?: readonly DMMF.Index[]
    readonly foreignKeyNames?: ReadonlyMap<string, string>
    readonly relationMode?: string
  },
) {
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
  // The name the database reports, unless the line gives one (not the word inside a message),
  // or the database is SQLite.
  const named = (args: string, name: string) =>
    provider === 'sqlite' || hasOption(args, 'name')
      ? args
      : args === ''
        ? `name: ${toElixirString(name)}`
        : `${args}, name: ${toElixirString(name)}`

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
        !c.field.isUpdatedAt &&
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
    const own = ectoCalls(model.fields.find((f) => f.name === first)?.documentation).calls.find(
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
  // no association in Ecto, so it is a foreign_key_constraint on the relation's name with the
  // message no_assoc_constraint gives.
  const inverseSteps = relationFields.flatMap((field) => {
    const call = ectoCalls(field.documentation).calls.find((c) => c.name === 'no_assoc_constraint')
    const key = foreignKeyOf(model, field, allModels)
    if (key?.side !== 'inverse') return []
    const onDelete = key.holder.relationOnDelete ?? (key.holder.isRequired ? 'Restrict' : 'SetNull')
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
    const args = call?.args ?? ''
    const message = field.isList
      ? '"are still associated with this entry"'
      : '"is still associated with this entry"'
    return [
      `foreign_key_constraint(${withArgs(
        atom,
        named(hasOption(args, 'message') ? args : withArgs(`message: ${message}`, args), name),
      )})`,
    ]
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
          '  # validate_required/3 for a column that takes "": missing is nil, and nothing else.',
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

export function ectoSchemas(
  models: readonly DMMF.Model[],
  app: string | string[],
  allModels?: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
  options: {
    readonly provider?: string
    readonly indexes?: readonly DMMF.Index[]
    readonly foreignKeyNames?: ReadonlyMap<string, string>
    readonly relationMode?: string
  } = {},
) {
  const appName: string = Array.isArray(app) ? app.join('.') : app
  const contextModels = allModels ?? models
  return models
    .map((model) => {
      const idField = model.fields.find((f) => f.isId)
      const compositePkFieldNames = new Set(model.primaryKey?.fields)
      const isCompositePk = !idField && compositePkFieldNames.size > 0

      if (!(idField || isCompositePk)) return ''

      const pk = idField
        ? getPrimaryKeyConfig(idField)
        : {
            line: '@primary_key false',
            typeSpec: '',
            omitIdFieldInSchema: false,
            foreignKeyType: null,
          }
      const fields = model.fields.map((f) => ({ ...f }))
      const timestamps = makeTimestampsLines(fields, appName)
      const timestampsExclude = timestamps.exclude
      const associations = getAssociations(model, contextModels, appName)

      const belongsToFkFields = new Set(associations.belongsTo.map((a) => a.foreignKey))

      const enumMap = new Map<string, readonly DMMF.DatamodelEnum['values'][number][]>()
      if (enums) {
        for (const e of enums) {
          enumMap.set(e.name, [...e.values])
        }
      }

      const schemaFieldsRaw = fields.filter(
        (f) =>
          !(
            f.relationName !== undefined ||
            (f.isId && pk.omitIdFieldInSchema) ||
            timestampsExclude.has(f.name) ||
            belongsToFkFields.has(f.name)
          ),
      )

      const compositePkFkTypeSpecs = isCompositePk
        ? associations.belongsTo
            .filter((a) => compositePkFieldNames.has(a.foreignKey))
            .map((a) => {
              const snakeFk = makeSnakeCase(a.foreignKey)
              const fkType = a.fkType ?? 'id'
              return `${snakeFk}: ${ectoTypeToTypespec(fkType)}`
            })
        : []

      const typeSpecFields = [
        ...(pk.omitIdFieldInSchema ? [`id: ${pk.typeSpec}`] : []),
        ...compositePkFkTypeSpecs,
        ...schemaFieldsRaw.map((f) => {
          const nullSuffix = f.isRequired ? '' : ' | nil'
          if (f.kind === 'enum') {
            return `${makeSnakeCase(f.name)}: atom()${nullSuffix}`
          }
          const baseTypeSpec = ectoTypeToTypespec(
            f.type === 'DateTime' ? dateTimeModule(f) : prismaTypeToEctoType(f.type),
          )
          const typeSpec = f.isList ? `[${baseTypeSpec}]` : baseTypeSpec
          return `${makeSnakeCase(f.name)}: ${typeSpec}${nullSuffix}`
        }),
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

      const typeSpecLines = [
        '  @type t :: %__MODULE__{',
        ...typeSpecFields.map((line, i) => {
          const isLast = i === typeSpecFields.length - 1
          return `          ${line}${isLast ? '' : ','}`
        }),
        '        }',
      ]

      const schemaFields = schemaFieldsRaw.map((f) => {
        const snakeName = makeSnakeCase(f.name)
        const primary =
          (f.isId && !pk.omitIdFieldInSchema) || compositePkFieldNames.has(f.name)
            ? ', primary_key: true'
            : ''
        const dbColumnName = f.dbName ?? f.name
        const sourceOpt = snakeName !== dbColumnName ? `, source: :${dbColumnName}` : ''

        if (f.kind === 'enum') {
          const values = enumMap.get(f.type) ?? []
          // @map-ped values need the keyword form (atom -> dump value) so
          // Ecto dumps the database value, not the atom's own name.
          const hasMappedValue = values.some((v) => v.dbName && v.dbName !== v.name)
          const valuesStr = hasMappedValue
            ? values.map((v) => `${v.name}: "${v.dbName ?? v.name}"`).join(', ')
            : values.map((v) => `:${v.name}`).join(', ')
          const enumType = f.isList ? '{:array, Ecto.Enum}' : 'Ecto.Enum'
          const enumDefault = typeof f.default === 'string' ? `, default: :${f.default}` : ''
          return `    field(:${snakeName}, ${enumType}, values: [${valuesStr}]${enumDefault}${sourceOpt})`
        }

        const type =
          f.type === 'DateTime'
            ? `${appName}.${dateTimeModule(f)}`
            : `:${prismaTypeToEctoType(f.type)}`
        const ectoType = f.isList ? `{:array, ${type}}` : type
        const defaultOpt = ectoDefaultOption(f)
        const defaultClause = defaultOpt ? `, ${defaultOpt}` : ''
        return `    field(:${snakeName}, ${ectoType}${primary}${defaultClause}${sourceOpt})`
      })

      const fkFieldLines: string[] = []
      for (const a of associations.belongsTo) {
        const snakeFk = makeSnakeCase(a.foreignKey)
        const fkFieldObj = fields.find((f) => f.name === a.foreignKey)
        const fkDbName = fkFieldObj?.dbName ?? a.foreignKey
        const needsSource = snakeFk !== fkDbName
        const isPkField = compositePkFieldNames.has(a.foreignKey)
        // belongs_to takes no :default: a foreign key with one is a field of its own.
        const defaultOpt = fkFieldObj ? ectoDefaultOption(fkFieldObj) : null
        if (needsSource || isPkField || defaultOpt) {
          const fkType = a.fkType ?? 'id'
          const pkOpt = isPkField ? ', primary_key: true' : ''
          const defaultClause = defaultOpt ? `, ${defaultOpt}` : ''
          const sourceOpt = needsSource ? `, source: :${fkDbName}` : ''
          fkFieldLines.push(
            `    field(:${snakeFk}, ${formatEctoType(fkType)}${pkOpt}${defaultClause}${sourceOpt})`,
          )
        }
      }

      const belongsToLines = associations.belongsTo.map((a) => {
        const snakeFk = makeSnakeCase(a.foreignKey)
        const snakeAssocName = makeSnakeCase(a.name)
        const fkFieldObj = fields.find((f) => f.name === a.foreignKey)
        const fkDbName = fkFieldObj?.dbName ?? a.foreignKey
        const needsSource = snakeFk !== fkDbName
        const isPkField = compositePkFieldNames.has(a.foreignKey)
        const hasDefault = fkFieldObj ? ectoDefaultOption(fkFieldObj) !== null : false
        const opts: string[] = [`foreign_key: :${snakeFk}`]
        if (needsSource || isPkField || hasDefault) opts.push('define_field: false')
        // A module's @foreign_key_type reaches every belongs_to in it: one whose key is of
        // Ecto's default :id type says so where the module's default is another.
        if ((a.fkType ?? 'id') !== (pk.foreignKeyType ?? 'id')) {
          opts.push(`type: ${formatEctoType(a.fkType ?? 'id')}`)
        }
        if (a.references !== 'id') opts.push(`references: :${a.references}`)
        return `    belongs_to(:${snakeAssocName}, ${appName}.${makePascalCase(a.targetModel)}, ${opts.join(', ')})`
      })

      const hasOneLines = associations.hasOne.map((a) => {
        const snakeFk = makeSnakeCase(a.foreignKey)
        const snakeAssocName = makeSnakeCase(a.name)
        const referencesOpt = a.references === 'id' ? '' : `, references: :${a.references}`
        return `    has_one(:${snakeAssocName}, ${appName}.${makePascalCase(a.targetModel)}, foreign_key: :${snakeFk}${referencesOpt})`
      })

      const hasManyLines = associations.hasMany.map((a) => {
        const snakeFk = makeSnakeCase(a.foreignKey)
        const snakeAssocName = makeSnakeCase(a.name)
        const referencesOpt = a.references === 'id' ? '' : `, references: :${a.references}`
        return `    has_many(:${snakeAssocName}, ${appName}.${makePascalCase(a.targetModel)}, foreign_key: :${snakeFk}${referencesOpt})`
      })

      const manyToManyLines = associations.manyToMany.map((a) => {
        const snakeAssocName = makeSnakeCase(a.name)
        // Prisma implicit m2m join tables use columns "A"/"B" (models in
        // alphabetical order), not Ecto's inflected <schema>_id defaults.
        const joinKeys = `join_keys: [${a.ownJoinColumn}: :${a.ownKey}, ${a.relatedJoinColumn}: :${a.relatedKey}]`
        return `    many_to_many(:${snakeAssocName}, ${appName}.${makePascalCase(a.targetModel)}, join_through: "${a.joinThrough}", ${joinKeys})`
      })

      const moduledoc = stripAnnotations(model.documentation)
      const changeset = changesetLines(model, contextModels, options)
      const lines = [
        `defmodule ${appName}.${makePascalCase(model.name)} do`,
        '  use Ecto.Schema',
        ...(changeset.length > 0 ? ['  import Ecto.Changeset'] : []),
        ...(moduledoc
          ? [
              `  @moduledoc """`,
              // A heredoc interpolates and escapes: a doc comment is text, so neither applies.
              ...moduledoc
                .replaceAll('\\', '\\\\')
                .replaceAll('#{', '\\#{')
                .replaceAll('"""', '\\"""')
                .split('\n')
                .map((l) => `  ${l}`),
              '  """',
            ]
          : ['  @moduledoc false']),
        '',
        `  ${pk.line}`,
        ...(pk.foreignKeyType ? [`  @foreign_key_type ${formatEctoType(pk.foreignKeyType)}`] : []),
        ...(timestamps.attribute ? [timestamps.attribute] : []),
        '',
        ...typeSpecLines,
        '',
        `  schema "${model.dbName ?? model.name}" do`,
        ...schemaFields,
        ...fkFieldLines,
        ...belongsToLines,
        ...hasOneLines,
        ...hasManyLines,
        ...manyToManyLines,
        ...timestamps.lines,
        '  end',
        ...changeset,
        'end',
      ]

      return lines.join('\n')
    })
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
  const session =
    provider === 'postgresql' || provider === 'cockroachdb'
      ? [
          '',
          '  A `@db.Timestamptz` column holds the instant whatever the session, as Postgrex sends it,',
          '  but Prisma Client writes it as UTC text with no zone, which PostgreSQL reads in the',
          "  session's time zone, and reads the offset back as `+00:00`: connect Prisma Client with",
          "  `options: '-c TimeZone=UTC'`, and the repo with `parameters: [timezone: \"UTC\"]`, or the",
          '  two read different instants.',
        ]
      : provider === 'mysql'
        ? [
            '',
            '  MySQL converts a `TIMESTAMP` column from the session\'s `time_zone` and back, for Ecto as',
            '  for Prisma Client, which writes UTC: connect the repo with',
            "  `after_connect: {MyXQL, :query!, [\"SET time_zone = '+00:00'\", []]}` where the server's",
            '  zone is not UTC.',
          ]
        : []
  const dateTime = [
    `defmodule ${app}.PrismaDateTime do`,
    '  @moduledoc """',
    '  A `DateTime` as Prisma Client keeps it: the instant in UTC, in milliseconds. Writes, and the',
    '  values a query binds, go through `dump/1`, so Prisma finds what Ecto wrote by the same',
    ...(sqlite
      ? [
          '  instant and Ecto what Prisma wrote. On SQLite that is the text Prisma writes,',
          '  `2030-01-01T09:00:00.000+00:00`: SQLite compares and sorts the text, and a row in another',
          '  form (`…Z`, no milliseconds, a space) would be missed by an equality or a range.',
        ]
      : [
          '  instant and Ecto what Prisma wrote: microseconds are cut to milliseconds, as a',
          '  JavaScript Date holds them. A column with no time zone holds UTC.',
        ]),
    '',
    '  A value read is the instant Prisma reads: text with no zone is UTC, an offset is honoured, a',
    '  date alone is midnight UTC, digits are epoch milliseconds. A `NaiveDateTime` is UTC, as',
    '  `:utc_datetime` takes one; a `DateTime` in another zone is moved to UTC.',
    ...session,
    '  """',
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
    '  @doc "Now, as Prisma Client fills `now()` and `@updatedAt`."',
    '  def autogenerate, do: utc(DateTime.utc_now())',
    '',
    '  # A date alone, or epoch milliseconds as digits.',
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
    '  @moduledoc """',
    '  A `DateTime @db.Date` as Prisma Client keeps it: Prisma writes the UTC date of the instant it',
    '  is given and reads the date as midnight UTC. A `DateTime`, or text with an offset, is cast to',
    '  its UTC date, where `:date` would take the date as written; a date alone is that date.',
    '  """',
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
    '  @doc "Today in UTC, as Prisma Client fills `now()` and `@updatedAt`."',
    '  def autogenerate, do: Date.utc_today()',
    'end',
  ]
  const time = [
    `defmodule ${app}.PrismaTime do`,
    '  @moduledoc """',
    '  A `DateTime @db.Time` or `@db.Timetz` as Prisma Client keeps it: Prisma writes the UTC time of',
    '  day of the instant it is given, in milliseconds, and reads it on 1970-01-01 in UTC. A',
    '  `DateTime` is cast to its UTC time, and so is a time written with an offset, which `:time`',
    '  would drop.',
    '  """',
    '  use Ecto.Type',
    '',
    '  @impl true',
    '  def type, do: :time_usec',
    '',
    '  @impl true',
    '  def cast(%Time{} = value), do: {:ok, milliseconds(value)}',
    '',
    '  def cast(value) do',
    '    # A time of day alone is read on 1970-01-01, as Prisma reads the column, so an offset counts.',
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
    '  @doc "The time of day in UTC, as Prisma Client fills `now()` and `@updatedAt`."',
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
