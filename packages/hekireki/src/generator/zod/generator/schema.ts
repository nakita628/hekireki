import type { DMMF } from '@prisma/generator-helper'
import { makeAnnotationExtractor, makeJsDoc, makeZodCardinality, makeZodObject } from 'utils-lab'

const zPrim = (f: DMMF.Field): string => {
  const extractor = makeAnnotationExtractor('@z.')
  const anno = extractor(f.documentation ?? '')
  return makeZodCardinality(`z.${anno}`, f.isList, f.isRequired)
}

export function buildZodModel(
  model: DMMF.Model,
): `export const ${string}Schema = ${string}\n\nexport type ${string} = z.infer<typeof ${string}Schema>` {
  const fields = model.fields
    .filter((f) => f.kind !== 'object')
    .map((f) => `${makeJsDoc(f.documentation, ['@z.', '@v.'])}  ${f.name}: ${zPrim(f)},`)
    .join('\n')

  const extractor = makeAnnotationExtractor('@z.')
  const anno = model.documentation ? extractor(model.documentation) : null
  const wrapperType =
    anno === 'strictObject' ? 'strictObject' : anno === 'looseObject' ? 'looseObject' : 'object'
  const objectDef = makeZodObject(fields, wrapperType)

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
  const base = `  ...${model.name}Schema.shape,`
  const rels = relProps
    .map(
      (r) => `  ${r.key}: ${r.isMany ? `z.array(${r.targetModel}Schema)` : `${r.targetModel}Schema`},`,
    )
    .join('\n')

  const fields = `${base}\n${rels}`

  const typeLine = options?.includeType
    ? `\n\nexport type ${model.name}Relations = z.infer<typeof ${model.name}RelationsSchema>`
    : ''
  return `export const ${model.name}RelationsSchema = z.object({\n${fields}\n})${typeLine}`
}

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
