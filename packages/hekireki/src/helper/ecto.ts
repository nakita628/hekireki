import type { DMMF } from '@prisma/generator-helper'

import {
  isAnnotationLine,
  makePascalCase,
  makeSnakeCase,
  stripAnnotations,
} from '../utils/index.js'
import { prismaConstraintName } from '../utils/prisma-postgres.js'

export function prismaTypeToEctoType(
  type: string,
): 'integer' | 'string' | 'boolean' | 'utc_datetime' | 'float' | 'decimal' | 'map' | 'binary' {
  if (type === 'Int') return 'integer'
  if (type === 'BigInt') return 'integer'
  if (type === 'Float') return 'float'
  if (type === 'Decimal') return 'decimal'
  if (type === 'String') return 'string'
  if (type === 'Boolean') return 'boolean'
  if (type === 'DateTime') return 'utc_datetime'
  if (type === 'Json') return 'map'
  if (type === 'Bytes') return 'binary'
  return 'string'
}

export function ectoTypeToTypespec(type: string) {
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

function makeTimestampsLine(fields: readonly DMMF.Field[]) {
  const insertedAliases = new Set(['inserted_at', 'created_at', 'createdAt'])
  const updatedAliases = new Set(['updated_at', 'modified_at', 'updatedAt', 'modifiedAt'])

  const inserted = fields.find((f) => insertedAliases.has(f.name))
  const updated =
    fields.find((f) => f.isUpdatedAt) ?? fields.find((f) => updatedAliases.has(f.name))

  const exclude = new Set<string>()
  if (inserted) exclude.add(inserted.name)
  if (updated) exclude.add(updated.name)

  if (!(inserted || updated)) return { line: null, exclude }

  const opts: string[] = ['type: :utc_datetime']

  if (inserted) {
    const source = inserted.dbName ?? inserted.name
    if (source !== 'inserted_at') {
      opts.push(`inserted_at_source: :${source}`)
    }
  } else {
    opts.push('inserted_at: false')
  }
  if (updated) {
    const source = updated.dbName ?? updated.name
    if (source !== 'updated_at') {
      opts.push(`updated_at_source: :${source}`)
    }
  } else {
    opts.push('updated_at: false')
  }

  return {
    line: `    timestamps(${opts.join(', ')})`,
    exclude,
  }
}

// The Ecto type of a foreign key is the type of the field it references: the target's primary
// key, or another unique field named in `references:`.
function getBelongsToFkType(
  allModels: readonly DMMF.Model[],
  targetModelName: string,
  referencedFieldName: string | undefined,
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

function getAssociations(model: DMMF.Model, allModels: readonly DMMF.Model[]) {
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
        fkType: getBelongsToFkType(allModels, field.type, field.relationToFields?.[0]),
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
    // A function default the database applies (now(), dbgenerated()): Ecto leaves a nil field
    // out of the INSERT, so the database fills it, and reads it back to have it on the struct.
    if (def.name === 'now' || def.name === 'dbgenerated') return 'read_after_writes: true'
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
    // :default against the field type at compile time: :utc_datetime
    // takes a ~U sigil at second precision (Ecto truncates every
    // write the same way), :map takes an Elixir map literal.
    if (f.type === 'BigInt') return `default: ${def}`
    if (f.type === 'DateTime') return `default: ~U[${def.slice(0, 19).replace('T', ' ')}Z]`
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
  const { exclude } = makeTimestampsLine(model.fields)
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
 * `no_assoc_constraint` of the other. Each names the model or field it is on.
 */
export function ectoProblems(models: readonly DMMF.Model[]) {
  return models.flatMap((model) => {
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
      const { line: timestampsLine, exclude: timestampsExclude } = makeTimestampsLine(fields)
      const associations = getAssociations(model, contextModels)

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
          const baseTypeSpec = ectoTypeToTypespec(prismaTypeToEctoType(f.type))
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

        const type = prismaTypeToEctoType(f.type)
        const ectoType = f.isList ? `{:array, :${type}}` : `:${type}`
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
        ...(timestampsLine ? [timestampsLine] : []),
        '  end',
        ...changeset,
        'end',
      ]

      return lines.join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}
