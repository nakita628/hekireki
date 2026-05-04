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

export function makeTypeBoxInfer(modelName: string) {
  return `export type ${modelName} = Static<typeof ${modelName}Schema>`
}

export function makeTypeBoxSchema(
  modelName: string,
  fields: string,
  objectType?: 'strict' | 'loose',
) {
  const obj = `Type.Object({\n${fields}\n})`
  return objectType === 'strict'
    ? `export const ${modelName}Schema = Type.Strict(${obj})`
    : `export const ${modelName}Schema = ${obj}`
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
) {
  return fields
    .map((field) => {
      const commentBlock = comment ? makeCommentBlock(field.comment, 2) : ''
      const expr = field.validation ?? 'Type.Unknown()'
      const wrapped = field.isRequired ? expr : `Type.Optional(${expr})`
      return `${commentBlock}  ${field.fieldName}: ${wrapped},`
    })
    .join('\n')
}

export function makeTypeBoxEnumExpression(values: readonly string[]) {
  return `Type.Union([${values.map((v) => `Type.Literal('${v}')`).join(', ')}])`
}

export const PRISMA_TO_TYPEBOX: Record<string, string> = {
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
  objectType?: 'strict' | 'loose',
) {
  return schemaFromFields(
    modelFields,
    comment,
    makeTypeBoxSchema,
    makeTypeBoxProperties,
    objectType,
  )
}

export function makeTypeBoxRelations(
  model: { readonly name: string },
  relProps: readonly {
    readonly key: string
    readonly targetModel: string
    readonly isMany: boolean
  }[],
  options?: { readonly includeType?: boolean },
) {
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

export function typeboxSchemaCode(
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

export function typeboxCode(
  dmmf: DMMF.Document,
  type: boolean,
  comment: boolean,
  relation: boolean,
): string {
  const base = typeboxSchemaCode(dmmf.datamodel.models, type, comment, dmmf.datamodel.enums)
  const relations = relation ? makeRelationsOnly(dmmf, type, makeTypeBoxRelations) : ''
  return [base, relations].filter(Boolean).join('\n\n')
}

export async function typebox(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    return {
      ok: false,
      error:
        'output is required for Hekireki-TypeBox. Please specify output in your generator config.',
    } as const
  }
  const output = options.generator.output.value
  const resolved = path.extname(output)
    ? { dir: path.dirname(output), file: output }
    : { dir: output, file: path.join(output, 'index.ts') }

  const code = typeboxCode(
    options.dmmf,
    getBool(options.generator.config?.type),
    getBool(options.generator.config?.comment),
    getBool(options.generator.config?.relation),
  )

  return emit(code, resolved.dir, resolved.file)
}
