import { isZod, isZodDocument } from '../validator/index.js'
import type { Config } from '../index.js'
import type { Model } from '../../../shared/types.js'
import { isFields } from '../../../shared/validator/is-fields.js'
import { groupByModel } from '../../../shared/helper/group-by-model.js'
import { infer } from './infer.js'
import { schemas } from './schemas.js'

const ZOD_IMPORT = `import { z } from 'zod/v4'\n` as const

/**
 * Generate Zod schemas and types
 * @param models - The models to generate the Zod schemas and types for
 * @param config - The configuration for the generator
 * @returns The generated Zod schemas and types
 */
export function zod(models: readonly Model[], config: Config): string {
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
      generateZodSchema: schemas(fields, config),
      generateZodInfer: config.type === 'true' ? infer(fields[0].modelName) : '',
    }
  })

  return [
    ZOD_IMPORT,
    '',
    zods
      .flatMap(({ generateZodSchema, generateZodInfer }) =>
        [generateZodSchema, generateZodInfer].filter(Boolean),
      )
      .join('\n\n'),
  ].join('\n')
}
