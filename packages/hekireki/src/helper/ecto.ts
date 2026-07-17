import type { DMMF } from '@prisma/generator-helper'

import { makeSnakeCase } from '../utils/index.js'

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
  return /^[A-Z]/.test(type) ? type : `:${type}`
}

function getPrimaryKeyConfig(field: DMMF.Field) {
  const def = field.default
  const isFunctionDefault = def && typeof def === 'object' && 'name' in def
  // @primary_key always declares the :id field; when the actual column
  // (@map / a differently named @id field) is not "id", map it via :source.
  const pkColumn = field.dbName ?? field.name
  const sourceOpt = pkColumn === 'id' ? '' : `, source: :${pkColumn}`

  // UUID PK: String + @default(uuid()) / @default(uuid(7))
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

  // Autoincrement PK: Int + @default(autoincrement())
  if (field.type === 'Int' && isFunctionDefault && def.name === 'autoincrement') {
    return {
      line: `@primary_key {:id, :id, autogenerate: true${sourceOpt}}`,
      typeSpec: 'integer()',
      omitIdFieldInSchema: true,
      foreignKeyType: null,
    }
  }

  // CUID or other string PK (no special Ecto type)
  return {
    line: '@primary_key false',
    typeSpec: 'String.t()',
    omitIdFieldInSchema: false,
    foreignKeyType: null,
  }
}

function makeTimestampsLine(fields: DMMF.Field[]): { line: string | null; exclude: Set<string> } {
  const insertedAliases = ['inserted_at', 'created_at', 'createdAt']
  const updatedAliases = ['updated_at', 'modified_at', 'updatedAt', 'modifiedAt']

  const inserted = fields.find((f) => insertedAliases.includes(f.name))
  const updated =
    fields.find((f) => f.isUpdatedAt) ?? fields.find((f) => updatedAliases.includes(f.name))

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
  }
  if (updated) {
    const source = updated.dbName ?? updated.name
    if (source !== 'updated_at') {
      opts.push(`updated_at_source: :${source}`)
    }
  }

  return {
    line: `    timestamps(${opts.join(', ')})`,
    exclude,
  }
}

function getBelongsToFkType(allModels: readonly DMMF.Model[], targetModelName: string) {
  const targetModel = allModels.find((m) => m.name === targetModelName)
  if (!targetModel) return null
  const targetPk = targetModel.fields.find((f) => f.isId)
  if (!targetPk) return null

  const pkConfig = getPrimaryKeyConfig(targetPk)

  // UUID PK → binary_id FK type / ULID PK → Ecto.ULID FK type
  if (pkConfig.foreignKeyType) return pkConfig.foreignKeyType

  // Autoincrement integer PK → no explicit FK type needed (Ecto default :id)
  if (pkConfig.line.includes(':id, autogenerate')) return null

  // CUID or other string PK → string FK type
  if (targetPk.type === 'String') return 'string'

  const ectoType = prismaTypeToEctoType(targetPk.type)
  if (ectoType === 'integer') return null
  return ectoType
}

function getAssociations(model: DMMF.Model, allModels: readonly DMMF.Model[]) {
  const belongsTo: {
    name: string
    targetModel: string
    foreignKey: string
    fkType: string | null
    references: string
  }[] = []
  const hasMany: { name: string; targetModel: string; foreignKey: string }[] = []
  const hasOne: { name: string; targetModel: string; foreignKey: string }[] = []
  const manyToMany: { name: string; targetModel: string; joinThrough: string }[] = []

  for (const field of model.fields) {
    if (field.kind !== 'object') continue

    if (field.relationFromFields && field.relationFromFields.length > 0) {
      belongsTo.push({
        name: field.name,
        targetModel: field.type,
        foreignKey: field.relationFromFields[0],
        fkType: getBelongsToFkType(allModels, field.type),
        references: field.relationToFields?.[0] ?? 'id',
      })
      continue
    }

    const targetModel = allModels.find((m) => m.name === field.type)
    if (!targetModel) continue

    if (field.isList) {
      const otherSide = targetModel.fields.find(
        (f) => f.relationName === field.relationName && f.kind === 'object',
      )
      if (otherSide?.isList) {
        const [left, right] =
          model.name < field.type ? [model.name, field.type] : [field.type, model.name]
        manyToMany.push({
          name: field.name,
          targetModel: field.type,
          joinThrough: `_${left}To${right}`,
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

    if (field.isList) {
      hasMany.push({ name: field.name, targetModel: field.type, foreignKey })
    } else {
      hasOne.push({ name: field.name, targetModel: field.type, foreignKey })
    }
  }

  return { belongsTo, hasMany, hasOne, manyToMany }
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
      const compositePkFieldNames = new Set(model.primaryKey?.fields ?? [])
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

      const enumMap = new Map<string, readonly string[]>()
      if (enums) {
        for (const e of enums) {
          enumMap.set(
            e.name,
            e.values.map((v) => v.name),
          )
        }
      }

      const schemaFieldsRaw = fields.filter(
        (f) =>
          !(
            f.relationName ||
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
          (a) => `${makeSnakeCase(a.name)}: ${appName}.${a.targetModel}.t() | nil`,
        ),
        ...associations.hasOne.map(
          (a) => `${makeSnakeCase(a.name)}: ${appName}.${a.targetModel}.t() | nil`,
        ),
        ...associations.hasMany.map(
          (a) => `${makeSnakeCase(a.name)}: [${appName}.${a.targetModel}.t()]`,
        ),
        ...associations.manyToMany.map(
          (a) => `${makeSnakeCase(a.name)}: [${appName}.${a.targetModel}.t()]`,
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
          const values = enumMap.get(f.type)
          const valuesStr = values ? values.map((v) => `:${v}`).join(', ') : ''
          return `    field(:${snakeName}, Ecto.Enum, values: [${valuesStr}]${sourceOpt})`
        }

        const type = prismaTypeToEctoType(f.type)
        const ectoType = f.isList ? `{:array, :${type}}` : `:${type}`
        const defaultOpt = ((def: DMMF.Field['default']): string | null => {
          if (def === undefined || def === null) return null
          if (typeof def === 'string') return `default: "${def}"`
          // Ecto rejects an integer default on a :float field
          // ("value 0 is invalid for type :float"): emit a float literal.
          if (typeof def === 'number') {
            return type === 'float' && Number.isInteger(def)
              ? `default: ${def}.0`
              : `default: ${def}`
          }
          if (typeof def === 'boolean') return `default: ${def}`
          return null
        })(f.default)
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
        if (needsSource || isPkField) {
          const fkType = a.fkType ?? 'id'
          const pkOpt = isPkField ? ', primary_key: true' : ''
          const sourceOpt = needsSource ? `, source: :${fkDbName}` : ''
          fkFieldLines.push(`    field(:${snakeFk}, ${formatEctoType(fkType)}${pkOpt}${sourceOpt})`)
        }
      }

      const belongsToLines = associations.belongsTo.map((a) => {
        const snakeFk = makeSnakeCase(a.foreignKey)
        const snakeAssocName = makeSnakeCase(a.name)
        const fkFieldObj = fields.find((f) => f.name === a.foreignKey)
        const fkDbName = fkFieldObj?.dbName ?? a.foreignKey
        const needsSource = snakeFk !== fkDbName
        const isPkField = compositePkFieldNames.has(a.foreignKey)
        const opts: string[] = [`foreign_key: :${snakeFk}`]
        if (needsSource || isPkField) opts.push('define_field: false')
        if (a.fkType && a.fkType !== pk.foreignKeyType) {
          opts.push(`type: ${formatEctoType(a.fkType)}`)
        }
        if (a.references !== 'id') opts.push(`references: :${a.references}`)
        return `    belongs_to(:${snakeAssocName}, ${appName}.${a.targetModel}, ${opts.join(', ')})`
      })

      const hasOneLines = associations.hasOne.map((a) => {
        const snakeFk = makeSnakeCase(a.foreignKey)
        const snakeAssocName = makeSnakeCase(a.name)
        return `    has_one(:${snakeAssocName}, ${appName}.${a.targetModel}, foreign_key: :${snakeFk})`
      })

      const hasManyLines = associations.hasMany.map((a) => {
        const snakeFk = makeSnakeCase(a.foreignKey)
        const snakeAssocName = makeSnakeCase(a.name)
        return `    has_many(:${snakeAssocName}, ${appName}.${a.targetModel}, foreign_key: :${snakeFk})`
      })

      const manyToManyLines = associations.manyToMany.map((a) => {
        const snakeAssocName = makeSnakeCase(a.name)
        return `    many_to_many(:${snakeAssocName}, ${appName}.${a.targetModel}, join_through: "${a.joinThrough}")`
      })

      const lines = [
        `defmodule ${appName}.${model.name} do`,
        '  use Ecto.Schema',
        ...(model.documentation
          ? [`  @moduledoc """`, ...model.documentation.split('\n').map((l) => `  ${l}`), '  """']
          : ['  @moduledoc false']),
        '',
        `  ${pk.line}`,
        ...(pk.foreignKeyType ? [`  @foreign_key_type ${formatEctoType(pk.foreignKeyType)}`] : []),
        '',
        ...typeSpecLines,
        '',
        `  schema "${model.dbName ?? makeSnakeCase(model.name)}" do`,
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
