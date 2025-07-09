import type { DMMF } from '@prisma/generator-helper'
import fsp from 'node:fs/promises'
import { join } from 'node:path'
import { snakeCase } from '../../../shared/utils/index.js'
import { prismaTypeToEctoType } from '../utils/prisma-type-to-ecto-type.js'

function getPrimaryKeyType(field: DMMF.Field): 'id' | 'binary_id' {
  const def = field.default
  return def && typeof def === 'object' && 'name' in def && def.name === 'uuid' ? 'binary_id' : 'id'
}

function makeMutable(models: readonly DMMF.Model[]): DMMF.Model[] {
  return models.map((m) => ({
    ...m,
    fields: m.fields?.map((f) => ({ ...f })) ?? [],
  }))
}

export function ectoSchemas(models: readonly DMMF.Model[], app: string | string[]): string {
  const mutableModels = makeMutable(models)

  return mutableModels
    .map((model) => {
      const idFields = model.fields.filter((f) => f.isId)
      const isCompositePK = model.primaryKey && model.primaryKey.fields.length > 1

      if (!(idFields.length || isCompositePK)) {
        return ''
      }

      const pkField = idFields[0]
      const pkType = pkField ? getPrimaryKeyType(pkField) : ':id'

      const excludedFieldNames = ['inserted_at', 'updated_at']

      const fields = model.fields.filter(
        (f) => !(f.relationName || excludedFieldNames.includes(f.name)),
      )

      const hasInsertedAt = model.fields.some((f) => f.name === 'inserted_at')
      const hasUpdatedAt = model.fields.some((f) => f.name === 'updated_at')

      const lines = [
        `defmodule ${app}.${model.name} do`,
        '  use Ecto.Schema',
        '  @primary_key false',
        `  schema "${snakeCase(model.name)}" do`,
        ...fields.map((f) => {
          const type = f.isId ? pkType : prismaTypeToEctoType(f.type)
          const primary = f.isId && !isCompositePK ? ', primary_key: true' : ''
          return `    field(:${f.name}, :${type}${primary})`
        }),
        ...(hasInsertedAt ? ['    field :inserted_at, :utc_datetime'] : []),
        ...(hasUpdatedAt ? ['    field :updated_at, :utc_datetime'] : []),
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
) {
  const mutableModels = makeMutable(models)

  await fsp.mkdir(outDir, { recursive: true })

  for (const model of mutableModels) {
    const code = ectoSchemas([model], app)
    if (!code.trim()) continue

    const filePath = join(outDir, `${snakeCase(model.name)}.ex`)
    await fsp.writeFile(filePath, code, 'utf8')
    console.log(`✅ wrote ${filePath}`)
  }
}
