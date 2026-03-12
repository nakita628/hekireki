import { makeValidationExtractor, parseDocumentWithoutAnnotations } from '../utils/index.js'
import { validationSchemas } from './prisma.js'

// ============================================================================
// AJV (JSON Schema) Helpers
// ============================================================================

export function makeAjvInfer(modelName: string): string {
  return `export type ${modelName} = FromSchema<typeof ${modelName}Schema>`
}

export function makeAjvProperties(
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
          ? `${field.comment.map((c) => `    /** ${c} */`).join('\n')}\n`
          : ''
      return `${commentLines}    ${field.fieldName}: ${field.validation ?? "{ type: 'unknown' as const }"},`
    })
    .join('\n')
}

export function makeAjvEnumExpression(values: readonly string[]): string {
  return `{ enum: [${values.map((v) => `'${v}'`).join(', ')}] as const }`
}

export const PRISMA_TO_AJV: { [k: string]: string } = {
  String: "{ type: 'string' as const }",
  Int: "{ type: 'integer' as const }",
  Float: "{ type: 'number' as const }",
  Boolean: "{ type: 'boolean' as const }",
  DateTime: "{ type: 'string' as const, format: 'date-time' as const }",
  BigInt: "{ type: 'integer' as const }",
  Decimal: "{ type: 'number' as const }",
  Json: '{}',
  Bytes: "{ type: 'string' as const }",
}

export function makeAjvSchemas(
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
  const modelName = modelFields[0].modelName
  const properties = makeAjvProperties(modelFields, comment)
  const requiredFields = modelFields.filter((f) => f.isRequired).map((f) => f.fieldName)
  const requiredLine =
    requiredFields.length > 0
      ? `\n  required: [${requiredFields.map((f) => `'${f}'`).join(', ')}] as const,`
      : ''
  return `export const ${modelName}Schema = {\n  type: 'object' as const,\n  properties: {\n${properties}\n  },${requiredLine}\n  additionalProperties: false,\n} as const`
}

export function makeAjvRelations(
  model: { readonly name: string },
  relProps: readonly {
    readonly key: string
    readonly targetModel: string
    readonly isMany: boolean
  }[],
  options?: { readonly includeType?: boolean },
): string | null {
  if (relProps.length === 0) return null
  const base = `    ...${model.name}Schema.properties,`
  const rels = relProps
    .map(
      (r) =>
        `    ${r.key}: ${r.isMany ? `{ type: 'array' as const, items: ${r.targetModel}Schema }` : `${r.targetModel}Schema`},`,
    )
    .join('\n')

  const fields = `${base}\n${rels}`

  const typeLine = options?.includeType
    ? `\n\nexport type ${model.name}Relations = FromSchema<typeof ${model.name}RelationsSchema>`
    : ''
  return `export const ${model.name}RelationsSchema = {\n  type: 'object' as const,\n  properties: {\n${fields}\n  },\n  additionalProperties: false,\n} as const${typeLine}`
}

export function ajv(
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
    importStatement: `import type { FromSchema } from 'json-schema-to-ts'`,
    annotationPrefix: '@j.',
    parseDocument: parseDocumentWithoutAnnotations,
    extractValidation: makeValidationExtractor('@j.'),
    inferType: makeAjvInfer,
    schemas: makeAjvSchemas,
    typeMapping: PRISMA_TO_AJV,
    enums,
    formatEnum: makeAjvEnumExpression,
  })
}
