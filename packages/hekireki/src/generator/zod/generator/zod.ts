import type { DMMF } from '@prisma/generator-helper'
import { groupByModel, isFields } from '../../../shared/utils/index.js'
import { infer, isZod, isZodDocument } from '../utils/index.js'
import { schemas } from './schemas.js'

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

  const zods = Object.values(groupByModel(isFields(modelFields))).map((fields) => {
    return {
      generateZodSchema: schemas(fields, comment),
      generateZodInfer: type ? infer(fields[0].modelName) : '',
    }
  })

  const importStatement =
    zodVersion === 'mini'
      ? `import * as z from 'zod/mini'`
      : zodVersion === '@hono/zod-openapi'
        ? `import { z } from '@hono/zod-openapi'`
        : `import * as z from 'zod'`

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
