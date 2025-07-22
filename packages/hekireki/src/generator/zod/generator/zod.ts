import type { DMMF } from '@prisma/generator-helper'
import { isZod, isZodDocument } from '../validator/index.js'
import { infer, schemas } from './index.js'
import { groupByModel, isFields } from '../../../shared/utils/index.js'

const ZODV4_IMPORT = `import { z } from 'zod/v4'\n` as const
const ZODV4_MINI_IMPORT = `import { z } from 'zod/v4-mini'\n` as const
const ZOD_OPENAPI_HONO_IMPORT = `import { z } from '@hono/zod-openapi'\n` as const

/**
 * Generate Zod schemas and types
 * @param models - The models to generate the Zod schemas and types for
 * @param type - Whether to generate types
 * @param comment - Whether to include comments in the generated code
 * @returns The generated Zod schemas and types
 */
export function zod(
  models: readonly Readonly<DMMF.Model>[],
  type: boolean,
  comment: boolean,
  zodVersion?: string | string[],
): string {
  const modelInfos = models.map((model) => {
    return {
      documentation: model.documentation ?? '',
      name: model.name,
      fields: model.fields,
    }
  })

  const modelFields = modelInfos.map((model) => {
    const fields = model.fields.map((field) => ({
      documentation: model.documentation,
      modelName: model.name,
      fieldName: field.name,
      comment: isZodDocument(field.documentation),
      validation: isZod(field.documentation),
    }))
    return fields
  })

  // null exclude
  const validFields = isFields(modelFields)

  // group by model
  const groupedByModel = groupByModel(validFields)

  const zods = Object.values(groupedByModel).map((fields) => {
    return {
      generateZodSchema: schemas(fields, comment),
      generateZodInfer: type ? infer(fields[0].modelName) : '',
    }
  })

  const importStatement =
    zodVersion === 'v4-mini'
      ? ZODV4_MINI_IMPORT
      : zodVersion === '@hono/zod-openapi'
        ? ZOD_OPENAPI_HONO_IMPORT
        : ZODV4_IMPORT

  return [
    importStatement,
    '',
    zods
      .flatMap(({ generateZodSchema, generateZodInfer }) =>
        [generateZodSchema, generateZodInfer].filter(Boolean),
      )
      .join('\n\n'),
  ].join('\n')
}
