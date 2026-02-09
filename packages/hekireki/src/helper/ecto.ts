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

  if (inserted?.name === 'inserted_at' && updated?.name === 'updated_at') {
    return { line: '    timestamps()', exclude }
  }

  return {
    line: `    timestamps(inserted_at: :${inserted?.name ?? 'inserted_at'}, updated_at: :${updated?.name ?? 'updated_at'})`,
    exclude,
  }
}

export function ectoSchemas(models: readonly DMMF.Model[], app: string | string[]): string {
  return models
    .map((model) => {
      const idField = model.fields.find((f) => f.isId)
      if (!idField) return ''

      const pk = getPrimaryKeyConfig(idField)
      const fields = model.fields.map((f) => ({ ...f }))
      const { line: timestampsLine, exclude: timestampsExclude } = makeTimestampsLine(fields)

      const schemaFieldsRaw = fields.filter(
        (f) =>
          !(f.relationName || (f.isId && pk.omitIdFieldInSchema) || timestampsExclude.has(f.name)),
      )

      const typeSpecFields = [
        `id: ${pk.typeSpec}`,
        ...schemaFieldsRaw.map(
          (f) => `${f.name}: ${ectoTypeToTypespec(prismaTypeToEctoType(f.type))}`,
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
        return `    field(:${f.name}, :${type}${primary}${defaultClause})`
      })

      const lines = [
        `defmodule ${app}.${model.name} do`,
        '  use Ecto.Schema',
        '',
        `  ${pk.line}`,
        '',
        ...typeSpecLines,
        '',
        `  schema "${makeSnakeCase(model.name)}" do`,
        ...schemaFields,
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
    const code = ectoSchemas([model], app)
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
