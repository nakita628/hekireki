import path from 'node:path'
import type { DMMF, GeneratorOptions } from '@prisma/generator-helper'
import { mkdir, writeFile } from '../fsp/index.js'

/**
 * Extract a string value from generator config.
 * Handles both single string and array of strings.
 */
export const getString = (
  v: string | string[] | undefined,
  fallback?: string,
): string | undefined =>
  typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? fallback) : fallback

/**
 * Extract a boolean value from generator config.
 * Accepts true, 'true', or ['true'] as truthy values.
 */
export const getBool = (v: unknown, fallback = false): boolean =>
  v === true || v === 'true' || (Array.isArray(v) && v[0] === 'true') ? true : fallback

export async function schemaGenerator(
  outDir: string,
  dmmf: GeneratorOptions['dmmf'],
  importCode: string,
  buildSchema: (model: DMMF.Model) => string,
  buildRelations: (
    model: DMMF.Model,
    relProps: readonly { key: string; targetModel: string; isMany: boolean }[],
  ) => string,
  collectRelationProps: (
    models: readonly DMMF.Model[],
  ) => readonly { model: string; key: string; targetModel: string; isMany: boolean }[],
): Promise<
  { readonly ok: true; readonly value: undefined } | { readonly ok: false; readonly error: string }
> {
  const models = dmmf.datamodel.models
  const relIndex = collectRelationProps(models)
  const relByModel = Object.groupBy(relIndex, (r) => r.model)

  const baseSchemas = models.map((m) => buildSchema(m)).join('\n\n')

  const relationSchemas = models
    .map((m) => {
      const relProps = (relByModel[m.name] ?? []).map(({ key, targetModel, isMany }) => ({
        key,
        targetModel,
        isMany,
      }))
      return buildRelations(m, relProps)
    })
    .filter(Boolean)
    .join('\n\n')

  const body = relationSchemas ? `${baseSchemas}\n\n${relationSchemas}` : baseSchemas
  const code = `${importCode}\n${body}\n`

  const mkdirResult = await mkdir(outDir)
  if (!mkdirResult.ok) {
    return mkdirResult
  }

  const writeResult = await writeFile(path.join(outDir, 'index.ts'), code)
  if (!writeResult.ok) {
    return writeResult
  }

  return { ok: true, value: undefined }
}
