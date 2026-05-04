import path from 'node:path'

import type { DMMF, GeneratorOptions } from '@prisma/generator-helper'

import { emit } from '../emit/index.js'
import { makeRelationsOnly } from '../helper/extract-relations.js'
import { validationSchemas } from '../helper/validation-schema.js'
import {
  getBool,
  makePropertiesGenerator,
  makeValidationExtractor,
  parseDocumentWithoutAnnotations,
  schemaFromFields,
} from '../utils/index.js'

export function makeValibotInfer(modelName: string) {
  return `export type ${modelName} = v.InferOutput<typeof ${modelName}Schema>`
}

export function makeValibotSchema(
  modelName: string,
  fields: string,
  objectType?: 'strict' | 'loose',
) {
  const wrapper =
    objectType === 'strict' ? 'strictObject' : objectType === 'loose' ? 'looseObject' : 'object'
  return `export const ${modelName}Schema = v.${wrapper}({\n${fields}\n})`
}

export function makeValibotEnumExpression(values: readonly string[]) {
  return `picklist([${values.map((v) => `'${v}'`).join(', ')}])`
}

export const PRISMA_TO_VALIBOT: Record<string, string> = {
  String: 'string()',
  Int: 'number()',
  Float: 'number()',
  Boolean: 'boolean()',
  DateTime: 'date()',
  BigInt: 'bigint()',
  Decimal: 'number()',
  Json: 'unknown()',
  Bytes: 'any()',
}

export function makeValibotSchemas(
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
    makeValibotSchema,
    makePropertiesGenerator('v', (expr, isRequired) =>
      isRequired ? expr : `v.exactOptional(${expr})`,
    ),
    objectType,
  )
}

export function makeValibotRelations(
  model: { readonly name: string },
  relProps: readonly {
    readonly key: string
    readonly targetModel: string
    readonly isMany: boolean
  }[],
  options?: { readonly includeType?: boolean },
) {
  if (relProps.length === 0) return null
  const base = `  ...${model.name}Schema.entries,`
  const rels = relProps
    .map(
      (r) =>
        `  ${r.key}: ${r.isMany ? `v.array(${r.targetModel}Schema)` : `${r.targetModel}Schema`},`,
    )
    .join('\n')
  const typeLine = options?.includeType
    ? `\n\nexport type ${model.name}Relations = v.InferOutput<typeof ${model.name}RelationsSchema>`
    : ''
  return `export const ${model.name}RelationsSchema = v.object({\n${base}\n${rels}\n})${typeLine}`
}

export function valibotSchemaCode(
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
    importStatement: `import * as v from 'valibot'`,
    annotationPrefix: '@v.',
    parseDocument: parseDocumentWithoutAnnotations,
    extractValidation: makeValidationExtractor('@v.'),
    inferType: makeValibotInfer,
    schemas: makeValibotSchemas,
    typeMapping: PRISMA_TO_VALIBOT,
    enums,
    formatEnum: makeValibotEnumExpression,
  })
}

export function valibotCode(
  dmmf: DMMF.Document,
  type: boolean,
  comment: boolean,
  relation: boolean,
): string {
  const base = valibotSchemaCode(dmmf.datamodel.models, type, comment, dmmf.datamodel.enums)
  const relations = relation ? makeRelationsOnly(dmmf, type, makeValibotRelations) : ''
  return [base, relations].filter(Boolean).join('\n\n')
}

export async function valibot(options: GeneratorOptions) {
  if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
    return {
      ok: false,
      error:
        'output is required for Hekireki-Valibot. Please specify output in your generator config.',
    } as const
  }
  const output = options.generator.output.value
  const resolved = path.extname(output)
    ? { dir: path.dirname(output), file: output }
    : { dir: output, file: path.join(output, 'index.ts') }

  const code = valibotCode(
    options.dmmf,
    getBool(options.generator.config?.type),
    getBool(options.generator.config?.comment),
    getBool(options.generator.config?.relation),
  )

  return emit(code, resolved.dir, resolved.file)
}
