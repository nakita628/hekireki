import {
  makeValidationExtractor,
  parseDocumentWithoutAnnotations,
  schemaFromFields,
} from '../utils/index.js'
import { validationSchemas } from './prisma.js'

// ============================================================================
// Effect Helpers
// ============================================================================

export function makeEffectInfer(
  modelName: string,
): `export type ${string}Encoded = typeof ${string}Schema.Encoded` {
  return `export type ${modelName}Encoded = typeof ${modelName}Schema.Encoded`
}

export function makeEffectSchema(
  modelName: string,
  fields: string,
): `export const ${string}Schema = Schema.Struct({\n${string}\n})` {
  return `export const ${modelName}Schema = Schema.Struct({\n${fields}\n})`
}

export function makeEffectProperties(
  fields: readonly {
    readonly documentation: string
    readonly modelName: string
    readonly fieldName: string
    readonly validation: string | null
    readonly isRequired: boolean
    readonly comment: readonly string[]
  }[],
  comment: boolean,
): string {
  return fields
    .map((field) => {
      const commentLines =
        comment && field.comment.length > 0
          ? `  /**\n${field.comment.map((c) => `   * ${c}`).join('\n')}\n   */\n`
          : ''
      return `${commentLines}  ${field.fieldName}: ${field.validation ?? 'Schema.Unknown'},`
    })
    .join('\n')
}

export function makeEffectEnumExpression(values: readonly string[]): `Schema.Literal(${string})` {
  return `Schema.Literal(${values.map((v) => `'${v}'`).join(', ')})`
}

export const PRISMA_TO_EFFECT: { [k: string]: string } = {
  String: 'Schema.String',
  Int: 'Schema.Number',
  Float: 'Schema.Number',
  Boolean: 'Schema.Boolean',
  DateTime: 'Schema.Date',
  BigInt: 'Schema.BigIntFromSelf',
  Decimal: 'Schema.Number',
  Json: 'Schema.Unknown',
  Bytes: 'Schema.Unknown',
}

export function makeEffectSchemas(
  modelFields: readonly {
    readonly documentation: string
    readonly modelName: string
    readonly fieldName: string
    readonly validation: string | null
    readonly isRequired: boolean
    readonly comment: readonly string[]
  }[],
  comment: boolean,
): string {
  return schemaFromFields(modelFields, comment, makeEffectSchema, makeEffectProperties)
}

export function makeEffectRelations(
  model: { readonly name: string },
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
    ? `\n\nexport type ${model.name}RelationsEncoded = typeof ${model.name}RelationsSchema.Encoded`
    : ''
  return `export const ${model.name}RelationsSchema = Schema.Struct({${fields}})${typeLine}`
}

export function effect(
  models: readonly {
    readonly name: string
    readonly documentation?: string
    readonly fields: readonly {
      readonly name: string
      readonly type: string
      readonly kind: string
      readonly documentation?: string
      readonly isRequired: boolean
      readonly isList: boolean
    }[]
  }[],
  type: boolean,
  comment: boolean,
  enums?: readonly {
    readonly name: string
    readonly values: readonly { readonly name: string }[]
  }[],
): string {
  return validationSchemas(models, type, comment, {
    importStatement: `import { Schema } from 'effect'`,
    annotationPrefix: '@e.',
    parseDocument: parseDocumentWithoutAnnotations,
    extractValidation: makeValidationExtractor('@e.'),
    inferType: makeEffectInfer,
    schemas: makeEffectSchemas,
    typeMapping: PRISMA_TO_EFFECT,
    enums,
    formatEnum: makeEffectEnumExpression,
  })
}
