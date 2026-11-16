import { makeValidationExtractor } from '../annotation/index.js'
import {
  makePropertiesGenerator,
  schemaFromFields,
  validationSchemas,
} from './validation-schema.js'

export function makeZodInfer(modelName: string) {
  return `export type ${modelName} = z.infer<typeof ${modelName}Schema>`
}

const ZOD_OBJECT_WRAPPER = { strict: 'strictObject', loose: 'looseObject' } as const

export function makeZodSchema(modelName: string, fields: string, objectType?: 'strict' | 'loose') {
  const wrapper = objectType === undefined ? 'object' : ZOD_OBJECT_WRAPPER[objectType]
  return `export const ${modelName}Schema = z.${wrapper}({\n${fields}\n})`
}

export function makeZodEnumExpression(values: readonly string[]) {
  return `enum([${values.map((v) => `'${v}'`).join(', ')}])`
}

export function makeZodListExpression(element: string) {
  return `array(z.${element})`
}

export const PRISMA_TO_ZOD: { [k: string]: string } = {
  String: 'string()',
  Int: 'number()',
  Float: 'number()',
  Boolean: 'boolean()',
  DateTime: 'iso.datetime()',
  BigInt: 'bigint()',
  Decimal: 'number()',
  Json: 'unknown()',
  Bytes: 'any()',
}

export function makeZodSchemas(
  modelFields: readonly {
    readonly documentation: string
    readonly modelName: string
    readonly fieldName: string
    readonly validation: string | null
    readonly isRequired: boolean
    readonly comment?: string
  }[],
  objectType?: 'strict' | 'loose',
) {
  return schemaFromFields(
    modelFields,
    makeZodSchema,
    makePropertiesGenerator('z', (expr, isRequired) =>
      isRequired ? expr : `${expr}.exactOptional()`,
    ),
    objectType,
  )
}

export function makeZodRelations(
  model: { readonly name: string },
  relProps: readonly {
    readonly key: string
    readonly targetModel: string
    readonly isMany: boolean
  }[],
  options?: { readonly includeType?: boolean },
) {
  if (relProps.length === 0) return null
  const base = `  ...${model.name}Schema.shape,`
  const rels = relProps
    .map(
      (r) =>
        `  ${r.key}: ${r.isMany ? `z.array(${r.targetModel}Schema)` : `${r.targetModel}Schema`},`,
    )
    .join('\n')
  const typeLine =
    options?.includeType === true
      ? `\n\nexport type ${model.name}Relations = z.infer<typeof ${model.name}RelationsSchema>`
      : ''
  return `export const ${model.name}RelationsSchema = z.object({\n${base}\n${rels}\n})${typeLine}`
}

function zodImportStatement(zodVersion: string | string[] | undefined) {
  if (zodVersion === 'mini') return `import * as z from 'zod/mini'`
  if (zodVersion === '@hono/zod-openapi') return `import { z } from '@hono/zod-openapi'`
  return `import * as z from 'zod'`
}

export function zodSchemaCode(
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
  zodVersion?: string | string[],
  enums?: readonly {
    readonly name: string
    readonly values: readonly { readonly name: string }[]
  }[],
) {
  const importStatement = zodImportStatement(zodVersion)

  return validationSchemas(models, type, {
    importStatement,
    annotationPrefix: '@z.',
    extractValidation: makeValidationExtractor('@z.'),
    inferType: makeZodInfer,
    schemas: makeZodSchemas,
    typeMapping: PRISMA_TO_ZOD,
    ...(enums === undefined ? {} : { enums }),
    formatEnum: makeZodEnumExpression,
    wrapList: makeZodListExpression,
  })
}
