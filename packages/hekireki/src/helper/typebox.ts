import {
  makeCommentBlock,
  makeValidationExtractor,
  parseDocumentWithoutAnnotations,
  schemaFromFields,
} from '../utils/index.js'
import { validationSchemas } from './prisma.js'

// ============================================================================
// TypeBox Helpers
// ============================================================================

/**
 * Generate TypeBox type inference using Static
 * @param modelName - The model name to generate type inference for
 */
export function makeTypeBoxInfer(
  modelName: string,
): `export type ${string} = Static<typeof ${string}Schema>` {
  return `export type ${modelName} = Static<typeof ${modelName}Schema>`
}

/**
 * Generate TypeBox Type.Object schema definition
 * @param modelName - The model name for the schema
 * @param fields - The formatted field definitions string
 */
export function makeTypeBoxSchema(
  modelName: string,
  fields: string,
): `export const ${string}Schema = Type.Object({\n${string}\n})` {
  return `export const ${modelName}Schema = Type.Object({\n${fields}\n})`
}

/**
 * Generate TypeBox property definitions with optional wrapping
 * @param fields - The fields to generate properties for
 * @param comment - Whether to include JSDoc comments in the generated code
 */
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
      const commentBlock = comment ? makeCommentBlock(field.comment, 2) : ''
      const expr = field.validation ?? 'Type.Unknown()'
      const wrapped = field.isRequired ? expr : `Type.Optional(${expr})`
      return `${commentBlock}  ${field.fieldName}: ${wrapped},`
    })
    .join('\n')
}

/**
 * Generate TypeBox enum expression using Type.Union with Type.Literal
 * @param values - The enum values to generate expression for
 */
export function makeTypeBoxEnumExpression(values: readonly string[]): `Type.Union([${string}])` {
  return `Type.Union([${values.map((v) => `Type.Literal('${v}')`).join(', ')}])`
}

/** Mapping from Prisma scalar types to TypeBox type expressions */
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

/**
 * Generate TypeBox Type.Object schema from model fields
 * @param modelFields - The fields of the model
 * @param comment - Whether to include JSDoc comments in the generated code
 */
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

/**
 * Generate TypeBox relation schema definition
 * @param model - The model to generate relations for
 * @param relProps - The relation properties
 * @param options - Options for type export generation
 */
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

/**
 * Generate TypeBox validation code from Prisma models
 * @param models - The Prisma data models
 * @param type - Whether to include type inference using Static
 * @param comment - Whether to include JSDoc comments in the generated code
 * @param enums - The Prisma enum definitions
 */
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
