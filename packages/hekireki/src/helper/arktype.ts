import {
  makeCommentBlock,
  makeValidationExtractor,
  parseDocumentWithoutAnnotations,
  schemaFromFields,
} from '../utils/index.js'
import { validationSchemas } from './validation-schema.js'

export function makeArktypeInfer(modelName: string) {
  return `export type ${modelName} = typeof ${modelName}Schema.infer`
}

export function makeArktypeSchema(
  modelName: string,
  fields: string,
  objectType?: 'strict' | 'loose',
) {
  const undeclared =
    objectType === 'strict'
      ? '\n  "+": "reject",\n'
      : objectType === 'loose'
        ? '\n  "+": "ignore",\n'
        : '\n'
  return `export const ${modelName}Schema = type({${undeclared}${fields}\n})`
}

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
) {
  return fields
    .map((field) => {
      const commentBlock = comment ? makeCommentBlock(field.comment, 2) : ''
      return `${commentBlock}  ${field.fieldName}: ${field.validation ?? '"unknown"'},`
    })
    .join('\n')
}

export function makeArktypeEnumExpression(values: readonly string[]) {
  return `"${values.map((v) => `'${v}'`).join(' | ')}"`
}

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
  objectType?: 'strict' | 'loose',
) {
  return schemaFromFields(
    modelFields,
    comment,
    makeArktypeSchema,
    makeArktypeProperties,
    objectType,
  )
}

export function makeArktypeRelations(
  model: { readonly name: string },
  relProps: readonly {
    readonly key: string
    readonly targetModel: string
    readonly isMany: boolean
  }[],
  options?: { readonly includeType?: boolean },
) {
  if (relProps.length === 0) return null
  const base = `...${model.name}Schema.t,`
  const rels = relProps
    .map(
      (r) => `${r.key}:${r.isMany ? `${r.targetModel}Schema.array()` : `${r.targetModel}Schema`},`,
    )
    .join('')
  const typeLine = options?.includeType
    ? `\n\nexport type ${model.name}Relations = typeof ${model.name}RelationsSchema.infer`
    : ''
  return `export const ${model.name}RelationsSchema = type({${base}${rels}})${typeLine}`
}

export function arktypeSchemaCode(
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
) {
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
