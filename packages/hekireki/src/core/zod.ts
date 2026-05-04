import path from 'node:path'

import type { DMMF, GeneratorOptions } from '@prisma/generator-helper'

import { emit } from '../emit/index.js'
import { makeRelationsOnly } from '../helper/extract-relations.js'
import { validationSchemas } from '../helper/validation-schema.js'
import {
  getBool,
  getString,
  makePropertiesGenerator,
  makeValidationExtractor,
  parseDocumentWithoutAnnotations,
  schemaFromFields,
} from '../utils/index.js'

export function makeZodInfer(modelName: string) {
  return `export type ${modelName} = z.infer<typeof ${modelName}Schema>`
}

export function makeZodSchema(modelName: string, fields: string, objectType?: 'strict' | 'loose') {
  const wrapper =
    objectType === 'strict' ? 'strictObject' : objectType === 'loose' ? 'looseObject' : 'object'
  return `export const ${modelName}Schema = z.${wrapper}({\n${fields}\n})`
}

export function makeZodEnumExpression(values: readonly string[]) {
  return `enum([${values.map((v) => `'${v}'`).join(', ')}])`
}

export const PRISMA_TO_ZOD: Record<string, string> = {
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
  objectType?: 'strict' | 'loose',
) {
  return schemaFromFields(
    modelFields,
    comment,
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
  const typeLine = options?.includeType
    ? `\n\nexport type ${model.name}Relations = z.infer<typeof ${model.name}RelationsSchema>`
    : ''
  return `export const ${model.name}RelationsSchema = z.object({\n${base}\n${rels}\n})${typeLine}`
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
  comment: boolean,
  zodVersion?: string | string[],
  enums?: readonly {
    readonly name: string
    readonly values: readonly { readonly name: string }[]
  }[],
) {
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

export function zodCode(
  dmmf: DMMF.Document,
  type: boolean,
  comment: boolean,
  relation: boolean,
  version: string,
): string {
  const base = zodSchemaCode(dmmf.datamodel.models, type, comment, version, dmmf.datamodel.enums)
  const relations = relation ? makeRelationsOnly(dmmf, type, makeZodRelations) : ''
  return [base, relations].filter(Boolean).join('\n\n')
}

export async function zod(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    return {
      ok: false,
      error: 'output is required for Hekireki-Zod. Please specify output in your generator config.',
    } as const
  }
  const output = options.generator.output.value
  const resolved = path.extname(output)
    ? { dir: path.dirname(output), file: output }
    : { dir: output, file: path.join(output, 'index.ts') }

  const code = zodCode(
    options.dmmf,
    getBool(options.generator.config?.type),
    getBool(options.generator.config?.comment),
    getBool(options.generator.config?.relation),
    getString(options.generator.config?.zod, 'v4'),
  )

  return emit(code, resolved.dir, resolved.file)
}
