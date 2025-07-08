import type { DMMF } from '@prisma/generator-helper'
import fsp from 'node:fs/promises'
import { join } from 'path'
import { snakeCase } from '../../../shared/utils/index.js'
import { prismaTypeToEctoType } from '../utils/prisma-type-to-ecto-type.js'

function getPrimaryKeyType(field: DMMF.Field): ':id' | ':binary_id' {
  return field.default &&
    typeof field.default === 'object' &&
    'name' in field.default &&
    field.default.name === 'uuid'
    ? ':binary_id'
    : ':id'
}

function generateRelations(
  model: DMMF.Model,
  allModels: DMMF.Model[],
  app: string,
  pkType: ':id' | ':binary_id',
): string[] {
  const lines: string[] = []

  for (const field of model.fields) {
    if (field.relationName && field.relationFromFields?.length) {
      lines.push(
        `belongs_to :${field.name}, ${app}.${field.type}, foreign_key: :${field.relationFromFields[0]}${
          pkType === ':binary_id' ? ', type: :binary_id' : ''
        }`,
      )
    }
  }

  for (const otherModel of allModels) {
    for (const f of otherModel.fields) {
      if (
        f.type === model.name &&
        f.relationName &&
        f.relationFromFields?.length &&
        f.name !== model.name
      ) {
        lines.push(
          `has_many :${snakeCase(otherModel.name)}, ${app}.${otherModel.name}, foreign_key: :${f.relationFromFields[0]}`,
        )
      }
    }
  }

  return lines
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

      if (!idFields.length && !isCompositePK) {
        console.warn(`⚠️ Model ${model.name} skipped: no primary key`)
        return ''
      }

      const pkField = idFields[0] // for non-composite use
      const pkType = pkField ? getPrimaryKeyType(pkField) : ':id'

      const relationFieldNames = model.fields
        .filter((f) => f.relationName && f.relationFromFields?.length)
        .flatMap((f) => f.relationFromFields ?? [])

      const excludedFieldNames = ['inserted_at', 'updated_at', ...relationFieldNames]

      const fields = model.fields.filter(
        (f) => !f.isId && !f.relationName && !excludedFieldNames.includes(f.name),
      )

      const hasInsertedAt = model.fields.some((f) => f.name === 'inserted_at')
      const hasUpdatedAt = model.fields.some((f) => f.name === 'updated_at')

      const relationLines = generateRelations(model, mutableModels, String(app), pkType)

      const lines = [
        `defmodule ${app}.${model.name} do`,
        `  use Ecto.Schema`,
        ``,
        isCompositePK
          ? `  @primary_key false`
          : pkType === ':id'
            ? `  @primary_key {:${pkField.name}, :id, autogenerate: true}`
            : `  @primary_key {:${pkField.name}, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id`,
        ``,
        `  schema "${snakeCase(model.name)}" do`,
        ...fields.map((f) => `    field :${f.name}, :${prismaTypeToEctoType(f.type)}`),
        ...(hasInsertedAt ? [`    field :inserted_at, :utc_datetime`] : []),
        ...(hasUpdatedAt ? [`    field :updated_at, :utc_datetime`] : []),
        ...(relationLines.length > 0 ? [''] : []),
        ...relationLines.map((l) => `    ${l}`),
        `  end`,
        `end`,
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

    const filePath = join(outDir, snakeCase(`${model.name}.ex`))
    await fsp.writeFile(filePath, code, 'utf8')
    console.log(`✅ wrote ${filePath}`)
  }
}
