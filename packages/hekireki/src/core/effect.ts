import path from 'node:path'

import type { DMMF, GeneratorOptions } from '@prisma/generator-helper'

import { emit } from '../emit/index.js'
import { makeRelationsOnly } from '../helper/extract-relations.js'
import { validationSchemas } from '../helper/validation-schema.js'
import {
  getBool,
  makeCommentBlock,
  makeValidationExtractor,
  parseDocumentWithoutAnnotations,
  schemaFromFields,
} from '../utils/index.js'

export function makeEffectInfer(modelName: string) {
  return `export type ${modelName}Encoded = typeof ${modelName}Schema.Encoded`
}

export function makeEffectSchema(modelName: string, fields: string) {
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
) {
  return fields
    .map((field) => {
      const commentBlock = comment ? makeCommentBlock(field.comment, 2) : ''
      return `${commentBlock}  ${field.fieldName}: ${field.validation ?? 'Schema.Unknown'},`
    })
    .join('\n')
}

export function makeEffectEnumExpression(values: readonly string[]) {
  return `Schema.Literal(${values.map((v) => `'${v}'`).join(', ')})`
}

export const PRISMA_TO_EFFECT: Record<string, string> = {
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
) {
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
) {
  if (relProps.length === 0) return null
  const base = `...${model.name}Schema.fields,`
  const rels = relProps
    .map(
      (r) =>
        `${r.key}:${r.isMany ? `Schema.Array(${r.targetModel}Schema)` : `${r.targetModel}Schema`},`,
    )
    .join('')
  const typeLine = options?.includeType
    ? `\n\nexport type ${model.name}RelationsEncoded = typeof ${model.name}RelationsSchema.Encoded`
    : ''
  return `export const ${model.name}RelationsSchema = Schema.Struct({${base}${rels}})${typeLine}`
}

export function effectSchemaCode(
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

export function effectCode(
  dmmf: DMMF.Document,
  type: boolean,
  comment: boolean,
  relation: boolean,
): string {
  const base = effectSchemaCode(dmmf.datamodel.models, type, comment, dmmf.datamodel.enums)
  const relations = relation ? makeRelationsOnly(dmmf, type, makeEffectRelations) : ''
  return [base, relations].filter(Boolean).join('\n\n')
}

export async function effect(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    return {
      ok: false,
      error:
        'output is required for Hekireki-Effect. Please specify output in your generator config.',
    } as const
  }
  const output = options.generator.output.value
  const resolved = path.extname(output)
    ? { dir: path.dirname(output), file: output }
    : { dir: output, file: path.join(output, 'index.ts') }

  const code = effectCode(
    options.dmmf,
    getBool(options.generator.config?.type),
    getBool(options.generator.config?.comment),
    getBool(options.generator.config?.relation),
  )

  return emit(code, resolved.dir, resolved.file)
}
