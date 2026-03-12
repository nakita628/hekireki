import {
  makePropertiesGenerator,
  makeValidationExtractor,
  parseDocumentWithoutAnnotations,
  schemaFromFields,
} from '../utils/index.js'
import { validationSchemas } from './prisma.js'

// ============================================================================
// Zod Helpers
// ============================================================================

export function makeZodInfer(
  modelName: string,
): `export type ${string} = z.infer<typeof ${string}Schema>` {
  return `export type ${modelName} = z.infer<typeof ${modelName}Schema>`
}

export function makeZodSchema(
  modelName: string,
  fields: string,
): `export const ${string}Schema = z.object({\n${string}\n})` {
  return `export const ${modelName}Schema = z.object({\n${fields}\n})`
}

export function makeZodEnumExpression(values: readonly string[]): `enum([${string}])` {
  return `enum([${values.map((v) => `'${v}'`).join(', ')}])`
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
    readonly comment: readonly string[]
  }[],
  comment: boolean,
): string {
  return schemaFromFields(
    modelFields,
    comment,
    makeZodSchema,
    makePropertiesGenerator('z', (expr, isRequired) =>
      isRequired ? expr : `${expr}.exactOptional()`,
    ),
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
): string | null {
  if (relProps.length === 0) return null
  const base = `  ...${model.name}Schema.shape,`
  const rels = relProps
    .map(
      (r) =>
        `  ${r.key}: ${r.isMany ? `z.array(${r.targetModel}Schema)` : `${r.targetModel}Schema`},`,
    )
    .join('\n')

  const typeLine = options?.includeType
    ? `\n\nexport type ${model.name}Relations = z.infer<typeof ${model.name}RelationsSchema>`
    : ''
  return `export const ${model.name}RelationsSchema = z.object({\n${base}\n${rels}\n})${typeLine}`
}

export function zod(
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
  zodVersion?: string | string[],
  enums?: readonly {
    readonly name: string
    readonly values: readonly { readonly name: string }[]
  }[],
): string {
  const importStatement =
    zodVersion === 'mini'
      ? `import * as z from 'zod/mini'`
      : zodVersion === '@hono/zod-openapi'
        ? `import { z } from '@hono/zod-openapi'`
        : `import * as z from 'zod'`

  return validationSchemas(models, type, comment, {
    importStatement,
    annotationPrefix: '@z.',
    parseDocument: parseDocumentWithoutAnnotations,
    extractValidation: makeValidationExtractor('@z.'),
    inferType: makeZodInfer,
    schemas: makeZodSchemas,
    typeMapping: PRISMA_TO_ZOD,
    enums,
    formatEnum: makeZodEnumExpression,
  })
}
