import type { DMMF } from '@prisma/generator-helper'
import { buildZodObject, extractAnno, jsdoc, wrapCardinality } from '../utils/index.js'

const zPrim = (f: DMMF.Field): string => {
  const anno = extractAnno(f.documentation ?? '', '@z.')
  return wrapCardinality(`z.${anno}`, f)
}

// moved to utils

export function buildZodModel(
  model: DMMF.Model,
): `export const ${string}Schema = ${string}\n\nexport type ${string} = z.infer<typeof ${string}Schema>` {
  const fields = model.fields
    .filter((f) => f.kind !== 'object')
    .map((f) => `${jsdoc(f.documentation)}  ${f.name}: ${zPrim(f)},`)
    .join('\n')

  const objectDef = buildZodObject(fields, model.documentation)

  return `export const ${model.name}Schema = ${objectDef}\n\nexport type ${model.name} = z.infer<typeof ${model.name}Schema>`
}

export function buildZodRelations(
  model: DMMF.Model,
  relProps: readonly {
    readonly key: string
    readonly targetModel: string
    readonly isMany: boolean
  }[],
  options?: { readonly includeType?: boolean },
): string | null {
  if (relProps.length === 0) return null
  const base = `...${model.name}Schema.shape`
  const rels = relProps
    .map(
      (r) => `${r.key}:${r.isMany ? `z.array(${r.targetModel}Schema)` : `${r.targetModel}Schema`}`,
    )
    .join(',')

  const objectDef = buildZodObject(`${base},${rels}`, model.documentation)

  const typeLine = options?.includeType
    ? `\n\nexport type ${model.name}Relations = z.infer<typeof ${model.name}RelationsSchema>`
    : ''
  return `export const ${model.name}RelationsSchema = ${objectDef}${typeLine}`
}

// moved to utils

/**
 * Generate Zod schema
 * @param modelName - The name of the model
 * @param fields - The fields of the model
 * @param config - The configuration for the generator
 * @returns The generated Zod schema
 */
export function schema(
  modelName: string,
  fields: string,
): `export const ${string}Schema = z.object({\n${string}\n})` {
  return `export const ${modelName}Schema = z.object({\n${fields}\n})`
}
