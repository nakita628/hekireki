import {
  makeCommentBlock,
  makeValidationExtractor,
  parseDocumentWithoutAnnotations,
  schemaFromFields,
} from '../utils/index.js'
import { validationSchemas } from './prisma.js'

// ============================================================================
// ArkType Helpers
// ============================================================================

/**
 * Generate ArkType type inference
 * @param modelName - The model name to generate type inference for
 */
export function makeArktypeInfer(
  modelName: string,
): `export type ${string} = typeof ${string}Schema.infer` {
  return `export type ${modelName} = typeof ${modelName}Schema.infer`
}

/**
 * Generate ArkType type() schema definition
 * @param modelName - The model name for the schema
 * @param fields - The formatted field definitions string
 */
export function makeArktypeSchema(
  modelName: string,
  fields: string,
): `export const ${string}Schema = type({\n${string}\n})` {
  return `export const ${modelName}Schema = type({\n${fields}\n})`
}

/**
 * Generate ArkType property definitions
 * @param fields - The fields to generate properties for
 * @param comment - Whether to include JSDoc comments in the generated code
 */
export function makeArktypeProperties(
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
      return `${commentBlock}  ${field.fieldName}: ${field.validation ?? '"unknown"'},`
    })
    .join('\n')
}

/**
 * Generate ArkType enum expression using union string syntax
 * @param values - The enum values to generate expression for
 */
export function makeArktypeEnumExpression(values: readonly string[]): `"${string}"` {
  return `"${values.map((v) => `'${v}'`).join(' | ')}"`
}

/** Mapping from Prisma scalar types to ArkType type expressions */
export const PRISMA_TO_ARKTYPE: { [k: string]: string } = {
  String: '"string"',
  Int: '"number"',
  Float: '"number"',
  Boolean: '"boolean"',
  DateTime: '"Date"',
  BigInt: '"bigint"',
  Decimal: '"number"',
  Json: '"unknown"',
  Bytes: '"unknown"',
}

/**
 * Generate ArkType type() schema from model fields
 * @param modelFields - The fields of the model
 * @param comment - Whether to include JSDoc comments in the generated code
 */
export function makeArktypeSchemas(
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
  return schemaFromFields(modelFields, comment, makeArktypeSchema, makeArktypeProperties)
}

/**
 * Generate ArkType relation schema definition
 * @param model - The model to generate relations for
 * @param relProps - The relation properties
 * @param options - Options for type export generation
 */
export function makeArktypeRelations(
  model: { readonly name: string },
  relProps: readonly {
    readonly key: string
    readonly targetModel: string
    readonly isMany: boolean
  }[],
  options?: { readonly includeType?: boolean },
): string | null {
  if (relProps.length === 0) return null
  const base = `...${model.name}Schema.t,`
  const rels = relProps
    .map(
      (r) => `${r.key}:${r.isMany ? `${r.targetModel}Schema.array()` : `${r.targetModel}Schema`},`,
    )
    .join('')

  const fields = `${base}${rels}`

  const typeLine = options?.includeType
    ? `\n\nexport type ${model.name}Relations = typeof ${model.name}RelationsSchema.infer`
    : ''
  return `export const ${model.name}RelationsSchema = type({${fields}})${typeLine}`
}

/**
 * Generate ArkType validation code from Prisma models
 * @param models - The Prisma data models
 * @param type - Whether to include type inference
 * @param comment - Whether to include JSDoc comments in the generated code
 * @param enums - The Prisma enum definitions
 */
export function arktype(
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
    importStatement: `import { type } from 'arktype'`,
    annotationPrefix: '@a.',
    parseDocument: parseDocumentWithoutAnnotations,
    extractValidation: makeValidationExtractor('@a.'),
    inferType: makeArktypeInfer,
    schemas: makeArktypeSchemas,
    typeMapping: PRISMA_TO_ARKTYPE,
    enums,
    formatEnum: makeArktypeEnumExpression,
  })
}
