import type { DMMF } from '@prisma/generator-helper'
import { validationSchemas } from './prisma.js'
import {
  makeAnnotationExtractor,
  makeJsDoc,
  makeValibotCardinality,
  makeValibotInfer,
  makeValibotObject,
  makeValibotSchemas,
  makeValidationExtractor,
  parseDocumentWithoutAnnotations,
} from '../utils/index.js'

const vPrim = (f: DMMF.Field): string => {
  const extractor = makeAnnotationExtractor('@v.')
  const anno = extractor(f.documentation ?? '')
  return makeValibotCardinality(`v.${anno}`, f.isList, f.isRequired)
}

export function makeValibotModel(model: DMMF.Model): string {
  const fields = model.fields
    .filter((f) => f.kind !== 'object')
    .map((f) => `${makeJsDoc(f.documentation, ['@z.', '@v.'])}  ${f.name}: ${vPrim(f)},`)
    .join('\n')

  const extractor = makeAnnotationExtractor('@v.')
  const modelAnno = model.documentation ? extractor(model.documentation) : null
  const wrapperType =
    modelAnno === 'strictObject'
      ? 'strictObject'
      : modelAnno === 'looseObject'
        ? 'looseObject'
        : 'object'
  const objectDef = makeValibotObject(fields, wrapperType)

  return `export const ${model.name}Schema = ${objectDef}\n\nexport type ${model.name} = v.InferInput<typeof ${model.name}Schema>`
}

export function makeValibotRelations(
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
      (r) =>
        `  ${r.key}: ${r.isMany ? `v.array(${r.targetModel}Schema)` : `${r.targetModel}Schema`},`,
    )
    .join('\n')

  const fields = `${base}\n${rels}`

  const typeLine = options?.includeType
    ? `\n\nexport type ${model.name}Relations = v.InferInput<typeof ${model.name}RelationsSchema>`
    : ''
  return `export const ${model.name}RelationsSchema = v.object({\n${fields}\n})${typeLine}`
}

export function valibot(models: readonly DMMF.Model[], type: boolean, comment: boolean): string {
  return validationSchemas(models, type, comment, {
    importStatement: `import * as v from 'valibot'`,
    annotationPrefix: '@v.',
    parseDocument: parseDocumentWithoutAnnotations,
    extractValidation: makeValidationExtractor('@v.'),
    inferType: makeValibotInfer,
    schemas: makeValibotSchemas,
  })
}
