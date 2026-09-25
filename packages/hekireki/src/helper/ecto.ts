import type { DMMF } from '@prisma/generator-helper'

import { makePascalCase, makeSnakeCase, stripAnnotations } from '../utils/index.js'

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

function makeTimestampsLine(fields: DMMF.Field[]) {
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

export function ectoSchemas(
  models: readonly DMMF.Model[],
  app: string | string[],
  allModels?: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
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
      const lines = [
        `defmodule ${appName}.${makePascalCase(model.name)} do`,
        '  use Ecto.Schema',
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
        'end',
      ]

      return lines.join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}
