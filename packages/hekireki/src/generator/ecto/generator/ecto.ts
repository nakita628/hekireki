import type { DMMF } from '@prisma/generator-helper'
import fsp from 'node:fs/promises'
import { join } from 'node:path'
import { snakeCase } from '../../../shared/utils/index.js'
import { prismaTypeToEctoType } from '../utils/prisma-type-to-ecto-type.js'

function getPrimaryKeyConfig(field: DMMF.Field): {
  line: string
  typeSpec: string
  omitIdFieldInSchema: boolean
} {
  if (
    field.type === 'String' &&
    field.default &&
    typeof field.default === 'object' &&
    'name' in field.default &&
    field.default.name === 'uuid'
  ) {
    return {
      line: `@primary_key {:id, :binary_id, autogenerate: true}`,
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

export function ectoSchemas(models: readonly DMMF.Model[], app: string | string[]): string {
  return models
    .map((model) => {
      const idField = model.fields.find((f) => f.isId)
      if (!idField) return ''

      const pk = getPrimaryKeyConfig(idField)
      const fields = model.fields.filter(
        (f) => !f.relationName && (!f.isId || !pk.omitIdFieldInSchema),
      )

      const typeSpecFields = [
        `id: ${pk.typeSpec}`,
        ...fields.map((f) => `${f.name}: ${ectoTypeToTypespec(prismaTypeToEctoType(f.type))}`),
      ]
      const typeSpecLines = [
        '  @type t :: %__MODULE__{',
        ...typeSpecFields.map((line, i) => {
          const isLast = i === typeSpecFields.length - 1
          return `          ${line}${isLast ? '' : ','}`
        }),
        '        }',
      ]

      const schemaFields = fields.map((f) => {
        const type = prismaTypeToEctoType(f.type)
        return `    field(:${f.name}, :${type})`
      })

      const lines = [
        `defmodule ${app}.${model.name} do`,
        '  use Ecto.Schema',
        '',
        `  ${pk.line}`,
        '',
        ...typeSpecLines,
        '',
        `  schema "${snakeCase(model.name)}" do`,
        ...schemaFields,
        '  end',
        'end',
      ]

      return lines.join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}

function ectoTypeToTypespec(type: string): string {
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
    case 'naive_datetime':
      return 'NaiveDateTime.t()'
    case 'utc_datetime':
      return 'DateTime.t()'
    default:
      return 'term()'
  }
}

export async function writeEctoSchemasToFiles(
  models: readonly DMMF.Model[],
  app: string | string[],
  outDir: string,
) {
  await fsp.mkdir(outDir, { recursive: true })

  for (const model of models) {
    const code = ectoSchemas([model], app)
    if (!code.trim()) continue

    const filePath = join(outDir, `${snakeCase(model.name)}.ex`)
    await fsp.writeFile(filePath, code, 'utf8')
    console.log(`✅ wrote ${filePath}`)
  }
}
