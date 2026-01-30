import type { DMMF } from '@prisma/generator-helper'
import { makeAnnotationExtractor, makeJsDoc, makeValibotCardinality, makeValibotObject } from 'utils-lab'

const vPrim = (f: DMMF.Field): string => {
  const extractor = makeAnnotationExtractor('@v.')
  const anno = extractor(f.documentation ?? '')
  return makeValibotCardinality(`v.${anno}`, f.isList, f.isRequired)
}

export function buildValibotModel(model: DMMF.Model): string {
  const fields = model.fields
    .filter((f) => f.kind !== 'object')
    .map((f) => `${makeJsDoc(f.documentation, ['@z.', '@v.'])}  ${f.name}: ${vPrim(f)},`)
    .join('\n')

  const extractor = makeAnnotationExtractor('@v.')
  const modelAnno = model.documentation ? extractor(model.documentation) : null
  const wrapperType =
    modelAnno === 'strictObject' ? 'strictObject' : modelAnno === 'looseObject' ? 'looseObject' : 'object'
  const objectDef = makeValibotObject(fields, wrapperType)

  return `export const ${model.name}Schema = ${objectDef}\n\nexport type ${model.name} = v.InferInput<typeof ${model.name}Schema>`
}

export function buildValibotRelations(
  model: DMMF.Model,
  relProps: readonly {
    readonly key: string
    readonly targetModel: string
    readonly isMany: boolean
  }[],
  options?: { readonly includeType?: boolean },
): string | null {
  if (relProps.length === 0) return null
  const base = `  ...${model.name}Schema.entries,`
  const rels = relProps
    .map(
      (r) => `  ${r.key}: ${r.isMany ? `v.array(${r.targetModel}Schema)` : `${r.targetModel}Schema`},`,
    )
    .join('\n')

  const fields = `${base}\n${rels}`

  const typeLine = options?.includeType
    ? `\n\nexport type ${model.name}Relations = v.InferInput<typeof ${model.name}RelationsSchema>`
    : ''
  return `export const ${model.name}RelationsSchema = v.object({\n${fields}\n})${typeLine}`
}

/**
 * Generate Valibot schema
 * @param modelName - The name of the model
 * @param fields - The fields of the model
 * @returns The generated Valibot schema
 */
export function schema(modelName: string, fields: string) {
  return `export const ${modelName}Schema = v.object({\n${fields}\n})`
}
