import type { DMMF } from '@prisma/generator-helper'
import fsp from 'node:fs/promises'
import { join } from 'node:path'
import { snakeCase } from '../../../shared/utils/index.js'
import { prismaTypeToEctoType } from '../utils/prisma-type-to-ecto-type.js'

/* ───────── Utilities ────────────────────────── */
/** UUID PK → :binary_id / otherwise :string */
function getPrimaryKeyType(field: DMMF.Field): 'string' | 'binary_id' {
  const def = field.default
  return def && typeof def === 'object' && 'name' in def && def.name === 'uuid'
    ? 'binary_id'
    : 'string'
}

/** Convert readonly models to mutable copies */
function makeMutable(models: readonly DMMF.Model[]): DMMF.Model[] {
  return models.map((m) => ({
    ...m,
    fields: m.fields?.map((f) => ({ ...f })) ?? [],
  }))
}

/* ───────── Main generator ───────────────────── */
export function ectoSchemas(models: readonly DMMF.Model[], app: string | string[]): string {
  const mutableModels = makeMutable(models)

  /** Timestamp column aliases (snake_case & camelCase) */
  const insertedAliases = ['inserted_at', 'created_at', 'createdAt']
  const updatedAliases = ['updated_at', 'modified_at', 'updatedAt', 'modifiedAt']

  return mutableModels
    .map((model) => {
      /* ── Primary-key handling ─────────────────── */
      const idFields = model.fields.filter((f) => f.isId)
      const isCompositePK = model.primaryKey && model.primaryKey.fields.length > 1
      if (!(idFields.length || isCompositePK)) return ''

      const pkField = idFields[0]
      const pkType = pkField ? getPrimaryKeyType(pkField) : 'id'

      /* ── Timestamp field detection ────────────── */
      const insertedField = model.fields.find((f) => insertedAliases.includes(f.name))
      const updatedField = model.fields.find((f) => updatedAliases.includes(f.name))

      /** Columns removed from explicit `field/3` declarations */
      const excludedNames = [
        ...(insertedField ? [insertedField.name] : []),
        ...(updatedField ? [updatedField.name] : []),
      ]

      /* ── Plain fields (no relations / no timestamps) ─ */
      const fields = model.fields.filter((f) => !(f.relationName || excludedNames.includes(f.name)))

      /* ── Build timestamps() line (const-only) ─────── */
      const timestampsLine = (() => {
        if (!(insertedField || updatedField)) return ''

        const hasCustom =
          (insertedField && insertedField.name !== 'inserted_at') ||
          (updatedField && updatedField.name !== 'updated_at')

        if (!hasCustom) return '    timestamps()' // both defaults → short form

        // Always include both keys when custom names are involved
        const insertedName = insertedField ? insertedField.name : 'inserted_at'
        const updatedName = updatedField ? updatedField.name : 'updated_at'

        return `    timestamps(inserted_at: :${insertedName}, updated_at: :${updatedName})`
      })()

      /* ── Assemble final module code ───────────── */
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
        ...(timestampsLine ? [timestampsLine] : []),
        '  end',
        'end',
      ]

      return lines.join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}

/* ───────── File writer ───────────────────────── */
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
