import type { DMMF } from '@prisma/generator-helper'
import { validationSchemas } from './prisma.js'
import {
  makeEffectInfer,
  makeEffectSchemas,
  makeValidationExtractor,
  parseDocumentWithoutAnnotations,
} from '../utils/index.js'

export function makeEffectRelations(
  model: DMMF.Model,
  relProps: readonly {
    readonly key: string
    readonly targetModel: string
    readonly isMany: boolean
  }[],
  options?: { readonly includeType?: boolean },
): string | null {
  if (relProps.length === 0) return null
  const base = `...${model.name}Schema.fields,`
  const rels = relProps
    .map(
      (r) =>
        `${r.key}:${r.isMany ? `Schema.Array(${r.targetModel}Schema)` : `${r.targetModel}Schema`},`,
    )
    .join('')

  const fields = `${base}${rels}`

  const typeLine = options?.includeType
    ? `\n\nexport type ${model.name}Relations = Schema.Schema.Type<typeof ${model.name}RelationsSchema>`
    : ''
  return `export const ${model.name}RelationsSchema = Schema.Struct({${fields}})${typeLine}`
}

export function effect(models: readonly DMMF.Model[], type: boolean, comment: boolean): string {
  return validationSchemas(models, type, comment, {
    importStatement: `import { Schema } from 'effect'`,
    annotationPrefix: '@e.',
    parseDocument: parseDocumentWithoutAnnotations,
    extractValidation: makeValidationExtractor('@e.'),
    inferType: makeEffectInfer,
    schemas: makeEffectSchemas,
  })
}
