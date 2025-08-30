import type { DMMF } from '@prisma/generator-helper'
import { extractAnno, jsdoc } from '../utils/index.js'

const vPrim = (f: DMMF.Field): string => {
  const anno = extractAnno(f.documentation ?? '', '@v.')
  return wrapV(`v.${anno}`, f)
}

const wrapV = (expr: string, f: DMMF.Field): string => {
  const card = f.isList ? `v.array(${expr})` : expr
  return f.isRequired ? card : `v.optional(${card})`
}

// jsdoc moved to utils

export function buildValibotModel(model: DMMF.Model): string {
  const fields = model.fields
    .filter((f) => f.kind !== 'object')
    .map((f) => `${jsdoc(f.documentation)}  ${f.name}: ${vPrim(f)},`)
    .join('\n')

  const modelAnno = extractAnno(model.documentation ?? '', '@v.')
  const objectDef =
    modelAnno === 'strictObject'
      ? `v.strictObject({\n${fields}\n})`
      : modelAnno === 'looseObject'
        ? `v.looseObject({\n${fields}\n})`
        : `v.object({\n${fields}\n})`

  return `export const ${model.name}Schema = ${objectDef}\n\nexport type ${model.name} = v.InferInput<typeof ${model.name}Schema>`
}

export function buildValibotRelations(
  model: DMMF.Model,
  relProps: readonly { key: string; targetModel: string; isMany: boolean }[],
  options?: Readonly<{ includeType?: boolean }>,
): string | null {
  if (relProps.length === 0) return null
  const base = `...${model.name}Schema.entries`
  const rels = relProps
    .map(
      (r) => `${r.key}:${r.isMany ? `v.array(${r.targetModel}Schema)` : `${r.targetModel}Schema`}`,
    )
    .join(',')

  const modelAnno = extractAnno(model.documentation ?? '', '@v.')
  const objectDef =
    modelAnno === 'strictObject'
      ? `v.strictObject({${base},${rels}})`
      : modelAnno === 'looseObject'
        ? `v.looseObject({${base},${rels}})`
        : `v.object({${base},${rels}})`

  const typeLine = options?.includeType
    ? `\n\nexport type ${model.name}Relations = v.InferInput<typeof ${model.name}RelationsSchema>`
    : ''
  return `export const ${model.name}RelationsSchema = ${objectDef}${typeLine}`
}

// extractAnno provided by utils

/**
 * Generate Valibot schema
 * @param modelName - The name of the model
 * @param fields - The fields of the model
 * @returns The generated Valibot schema
 */
export function schema(modelName: string, fields: string) {
  return `export const ${modelName}Schema = v.object({\n${fields}\n})`
}
