import { join } from 'node:path'
import type { DMMF } from '@prisma/generator-helper'
import { mkdir, writeFile } from '../fsp/index.js'
import { ectoTypeToTypespec, makeSnakeCase, prismaTypeToEctoType } from '../utils/index.js'

function getPrimaryKeyConfig(field: DMMF.Field) {
  if (
    field.type === 'String' &&
    field.default &&
    typeof field.default === 'object' &&
    'name' in field.default &&
    field.default.name === 'uuid'
  ) {
    return {
      line: '@primary_key {:id, :binary_id, autogenerate: true}',
      typeSpec: 'Ecto.UUID.t()',
      omitIdFieldInSchema: true,
    }
  }

  return {
    line: '@primary_key false',
    typeSpec: 'String.t()',
    omitIdFieldInSchema: false,
  }
}

function getFieldDefaultOption(field: DMMF.Field): string | null {
  const def = field.default
  if (def === undefined || def === null) return null
  if (typeof def === 'string') return `default: "${def}"`
  if (typeof def === 'number' || typeof def === 'boolean') return `default: ${def}`
  return null
}

function makeTimestampsLine(fields: DMMF.Field[]): { line: string | null; exclude: Set<string> } {
  const insertedAliases = ['inserted_at', 'created_at', 'createdAt']
  const updatedAliases = ['updated_at', 'modified_at', 'updatedAt', 'modifiedAt']

  const inserted = fields.find((f) => insertedAliases.includes(f.name))
  const updated = fields.find((f) => updatedAliases.includes(f.name))

  const exclude = new Set<string>()
  if (inserted) exclude.add(inserted.name)
  if (updated) exclude.add(updated.name)

  if (!(inserted || updated)) return { line: null, exclude }

  const opts: string[] = ['type: :utc_datetime']

  if (inserted && inserted.name !== 'inserted_at') {
    opts.push(`inserted_at_source: :${inserted.name}`)
  }
  if (updated && updated.name !== 'updated_at') {
    opts.push(`updated_at_source: :${updated.name}`)
  }

  return {
    line: `    timestamps(${opts.join(', ')})`,
    exclude,
  }
}

interface BelongsToAssoc {
  readonly name: string
  readonly targetModel: string
  readonly foreignKey: string
  readonly fkType: string | null
  readonly references: string
}

interface HasAssoc {
  readonly name: string
  readonly targetModel: string
  readonly foreignKey: string
}

function getBelongsToFkType(
  allModels: readonly DMMF.Model[],
  targetModelName: string,
): string | null {
  const targetModel = allModels.find((m) => m.name === targetModelName)
  if (!targetModel) return null
  const targetPk = targetModel.fields.find((f) => f.isId)
  if (!targetPk) return null

  const pkConfig = getPrimaryKeyConfig(targetPk)
  if (pkConfig.line.includes('binary_id')) return 'binary_id'

  const ectoType = prismaTypeToEctoType(targetPk.type)
  if (ectoType === 'integer') return null
  return ectoType
}

function getAssociations(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
): {
  belongsTo: BelongsToAssoc[]
  hasMany: HasAssoc[]
  hasOne: HasAssoc[]
} {
  const belongsTo: BelongsToAssoc[] = []
  const hasMany: HasAssoc[] = []
  const hasOne: HasAssoc[] = []

  for (const field of model.fields) {
    if (field.kind !== 'object') continue

    if (field.relationFromFields && field.relationFromFields.length > 0) {
      const fkFieldName = field.relationFromFields[0]
      const fkType = getBelongsToFkType(allModels, field.type)
      const references = field.relationToFields?.[0] ?? 'id'

      belongsTo.push({
        name: field.name,
        targetModel: field.type,
        foreignKey: fkFieldName,
        fkType,
        references,
      })
    } else if (field.isList) {
      const targetModel = allModels.find((m) => m.name === field.type)
      if (!targetModel) continue

      const otherSide = targetModel.fields.find(
        (f) => f.relationName === field.relationName && f.kind === 'object',
      )
      if (otherSide?.isList) continue

      const fkField = targetModel.fields.find(
        (f) =>
          f.relationName === field.relationName &&
          f.relationFromFields &&
          f.relationFromFields.length > 0,
      )
      const foreignKey = fkField?.relationFromFields?.[0]
      if (!foreignKey) continue

      hasMany.push({
        name: field.name,
        targetModel: field.type,
        foreignKey,
      })
    } else {
      const targetModel = allModels.find((m) => m.name === field.type)
      if (!targetModel) continue

      const fkField = targetModel.fields.find(
        (f) =>
          f.relationName === field.relationName &&
          f.relationFromFields &&
          f.relationFromFields.length > 0,
      )
      const foreignKey = fkField?.relationFromFields?.[0]
      if (!foreignKey) continue

      hasOne.push({
        name: field.name,
        targetModel: field.type,
        foreignKey,
      })
    }
  }

  return { belongsTo, hasMany, hasOne }
}

export function ectoSchemas(
  models: readonly DMMF.Model[],
  app: string | string[],
  allModels?: readonly DMMF.Model[],
): string {
  const contextModels = allModels ?? models
  return models
    .map((model) => {
      const idField = model.fields.find((f) => f.isId)
      if (!idField) return ''

      const pk = getPrimaryKeyConfig(idField)
      const useBinaryId = pk.line.includes('binary_id')
      const fields = model.fields.map((f) => ({ ...f }))
      const { line: timestampsLine, exclude: timestampsExclude } = makeTimestampsLine(fields)
      const associations = getAssociations(model, contextModels)

      const belongsToFkFields = new Set(associations.belongsTo.map((a) => a.foreignKey))

      const schemaFieldsRaw = fields.filter(
        (f) =>
          !(
            f.relationName ||
            (f.isId && pk.omitIdFieldInSchema) ||
            timestampsExclude.has(f.name) ||
            belongsToFkFields.has(f.name)
          ),
      )

      const typeSpecFields = [
        `id: ${pk.typeSpec}`,
        ...schemaFieldsRaw.map(
          (f) =>
            `${makeSnakeCase(f.name)}: ${ectoTypeToTypespec(prismaTypeToEctoType(f.type))}`,
        ),
        ...associations.belongsTo.map(
          (a) => `${makeSnakeCase(a.name)}: ${app}.${a.targetModel}.t() | nil`,
        ),
        ...associations.hasOne.map(
          (a) => `${makeSnakeCase(a.name)}: ${app}.${a.targetModel}.t() | nil`,
        ),
        ...associations.hasMany.map(
          (a) => `${makeSnakeCase(a.name)}: [${app}.${a.targetModel}.t()]`,
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
        const type = f.isId ? 'binary_id' : prismaTypeToEctoType(f.type)
        const primary = f.isId && !pk.omitIdFieldInSchema ? ', primary_key: true' : ''
        const defaultOpt = getFieldDefaultOption(f)
        const defaultClause = defaultOpt ? `, ${defaultOpt}` : ''
        const snakeName = makeSnakeCase(f.name)
        const sourceOpt = snakeName !== f.name ? `, source: :${f.name}` : ''
        return `    field(:${snakeName}, :${type}${primary}${defaultClause}${sourceOpt})`
      })

      const fkFieldLines: string[] = []
      for (const a of associations.belongsTo) {
        const snakeFk = makeSnakeCase(a.foreignKey)
        if (snakeFk !== a.foreignKey) {
          const fkType = a.fkType ?? 'id'
          fkFieldLines.push(`    field(:${snakeFk}, :${fkType}, source: :${a.foreignKey})`)
        }
      }

      const belongsToLines = associations.belongsTo.map((a) => {
        const snakeFk = makeSnakeCase(a.foreignKey)
        const snakeAssocName = makeSnakeCase(a.name)
        const needsSource = snakeFk !== a.foreignKey
        const opts: string[] = [`foreign_key: :${snakeFk}`]
        if (needsSource) opts.push('define_field: false')
        if (a.fkType && (!useBinaryId || a.fkType !== 'binary_id')) {
          opts.push(`type: :${a.fkType}`)
        }
        if (a.references !== 'id') opts.push(`references: :${a.references}`)
        return `    belongs_to(:${snakeAssocName}, ${app}.${a.targetModel}, ${opts.join(', ')})`
      })

      const hasOneLines = associations.hasOne.map((a) => {
        const snakeFk = makeSnakeCase(a.foreignKey)
        const snakeAssocName = makeSnakeCase(a.name)
        return `    has_one(:${snakeAssocName}, ${app}.${a.targetModel}, foreign_key: :${snakeFk})`
      })

      const hasManyLines = associations.hasMany.map((a) => {
        const snakeFk = makeSnakeCase(a.foreignKey)
        const snakeAssocName = makeSnakeCase(a.name)
        return `    has_many(:${snakeAssocName}, ${app}.${a.targetModel}, foreign_key: :${snakeFk})`
      })

      const lines = [
        `defmodule ${app}.${model.name} do`,
        '  use Ecto.Schema',
        '',
        `  ${pk.line}`,
        ...(useBinaryId ? ['  @foreign_key_type :binary_id'] : []),
        '',
        ...typeSpecLines,
        '',
        `  schema "${makeSnakeCase(model.name)}" do`,
        ...schemaFields,
        ...fkFieldLines,
        ...belongsToLines,
        ...hasOneLines,
        ...hasManyLines,
        ...(timestampsLine ? [timestampsLine] : []),
        '  end',
        'end',
      ]

      return lines.join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}

export async function writeEctoSchemasToFiles(
  models: readonly DMMF.Model[],
  app: string | string[],
  outDir: string,
): Promise<
  { readonly ok: true; readonly value: undefined } | { readonly ok: false; readonly error: string }
> {
  const mkdirResult = await mkdir(outDir)
  if (!mkdirResult.ok) {
    return mkdirResult
  }

  for (const model of models) {
    const code = ectoSchemas([model], app, models)
    if (!code.trim()) continue

    const filePath = join(outDir, `${makeSnakeCase(model.name)}.ex`)
    const writeResult = await writeFile(filePath, code)
    if (!writeResult.ok) {
      return writeResult
    }
    console.log(`wrote ${filePath}`)
  }

  return { ok: true, value: undefined }
}
