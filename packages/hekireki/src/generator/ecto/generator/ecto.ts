import type { DMMF } from '@prisma/generator-helper'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { decapitalize } from '../../../shared/utils/decapitalize.js'

function getPrimaryKeyType(field: DMMF.Field): string {
  const fieldDefault = field.default
  if (
    fieldDefault &&
    typeof fieldDefault === 'object' &&
    'name' in fieldDefault &&
    fieldDefault.name === 'uuid'
  ) {
    return ':binary_id'
  }
  return ':id'
}

function convertToEctoType(type: string): 'integer' | 'string' | 'boolean' | 'naive_datetime' {
  if (type === 'Int') return 'integer'
  if (type === 'String') return 'string'
  if (type === 'Boolean') return 'boolean'
  if (type === 'DateTime') return 'naive_datetime'
  return 'string'
}

export function generateEctoSchemas(models: readonly DMMF.Model[], app: string | string[]): string {
  return models
    .map((model) => {
      const primaryKeyField = model.fields.find((f) => f.isId)
      const regularFields = model.fields.filter((f) => !f.isId)

      if (!primaryKeyField) {
        throw new Error(`Model ${model.name} must have a primary key field`)
      }

      const pkType = getPrimaryKeyType(primaryKeyField)

      return `defmodule ${app}.${model.name} do
  use Ecto.Schema

  @primary_key {:${primaryKeyField.name}, ${pkType}, autogenerate: true}
  schema "${model.name}" do
    ${regularFields.map((field) =>
      `field(:${field.name}, :${convertToEctoType(field.type)})`
    ).join('\n    ')}
  end
end
`
    })
    .join('\n\n')
}


export async function writeEctoSchemasToFiles(
  models: readonly DMMF.Model[],
  app: string | string[],
  outDir: string
) {
  if (!existsSync(outDir)) {
    await mkdir(outDir, { recursive: true })
  }

  for (const model of models) {
    const schemaCode = generateEctoSchemas([model], app)
    const fileName = `${model.name}.ex`
    const filePath = join(outDir, decapitalize(fileName))
    await writeFile(filePath, schemaCode, 'utf8')
    console.log(`✅ wrote ${filePath}`)
  }
}
