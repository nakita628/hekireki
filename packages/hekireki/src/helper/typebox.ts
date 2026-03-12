import {
  makeValidationExtractor,
  parseDocumentWithoutAnnotations,
  schemaFromFields,
} from '../utils/index.js'
import { validationSchemas } from './prisma.js'

// ============================================================================
// TypeBox Helpers
// ============================================================================

export function makeTypeBoxInfer(
  modelName: string,
): `export type ${string} = Static<typeof ${string}Schema>` {
  return `export type ${modelName} = Static<typeof ${modelName}Schema>`
}

export function makeTypeBoxSchema(
  modelName: string,
  fields: string,
): `export const ${string}Schema = Type.Object({\n${string}\n})` {
  return `export const ${modelName}Schema = Type.Object({\n${fields}\n})`
}

export function makeTypeBoxProperties(
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
          ? `${field.comment.map((c) => `  /** ${c} */`).join('\n')}\n`
          : ''
      const expr = field.validation ?? 'Type.Unknown()'
      const wrapped = field.isRequired ? expr : `Type.Optional(${expr})`
      return `${commentLines}  ${field.fieldName}: ${wrapped},`
    })
    .join('\n')
}

export function makeTypeBoxEnumExpression(
  values: readonly string[],
): `Type.Union([${string}])` {
  return `Type.Union([${values.map((v) => `Type.Literal('${v}')`).join(', ')}])`
}

export const PRISMA_TO_TYPEBOX: { [k: string]: string } = {
  String: 'Type.String()',
  Int: 'Type.Integer()',
  Float: 'Type.Number()',
  Boolean: 'Type.Boolean()',
  DateTime: 'Type.Date()',
  BigInt: 'Type.BigInt()',
  Decimal: 'Type.Number()',
  Json: 'Type.Unknown()',
  Bytes: 'Type.Any()',
}

export function makeTypeBoxSchemas(
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
  return schemaFromFields(modelFields, comment, makeTypeBoxSchema, makeTypeBoxProperties)
}

export function makeTypeBoxRelations(
  model: { readonly name: string },
  relProps: readonly {
    readonly key: string
    readonly targetModel: string
    readonly isMany: boolean
  }[],
  options?: { readonly includeType?: boolean },
): `export const ${string}RelationsSchema = Type.Object({\n${string}\n})${string}` | null {
  if (relProps.length === 0) return null
  const base = `  ...${model.name}Schema.properties,`
  const rels = relProps
    .map(
      (r) =>
        `  ${r.key}: ${r.isMany ? `Type.Array(${r.targetModel}Schema)` : `${r.targetModel}Schema`},`,
    )
    .join('\n')

  const typeLine = options?.includeType
    ? `\n\nexport type ${model.name}Relations = Static<typeof ${model.name}RelationsSchema>`
    : ''
  return `export const ${model.name}RelationsSchema = Type.Object({\n${base}\n${rels}\n})${typeLine}`
}

export function typebox(
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
    importStatement: type
      ? `import { type Static, Type } from '@sinclair/typebox'`
      : `import { Type } from '@sinclair/typebox'`,
    annotationPrefix: '@t.',
    parseDocument: parseDocumentWithoutAnnotations,
    extractValidation: makeValidationExtractor('@t.'),
    inferType: makeTypeBoxInfer,
    schemas: makeTypeBoxSchemas,
    typeMapping: PRISMA_TO_TYPEBOX,
    enums,
    formatEnum: makeTypeBoxEnumExpression,
  })
}
