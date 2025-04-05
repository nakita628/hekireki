import type { Config } from '..'
import type { Model } from '../../../common/type'
import { isValibotDocumentValidation } from '../validator/is-valibot-documentation'
import { isValibotValidation } from '../validator/is-valibot-validation'
import { isFieldsValidation } from '../../../common/validator/is-fields-validation'
import { groupByModelHelper } from '../../../common/helper/group-by-model-helper'
import { generateValibotSchemas } from './generate-valibot-schemas'
import { generateValibotInferInput } from './generate-valibot-infer-input'
const VALIBOT_IMPORT = `import * as v from 'valibot'\n` as const

/**
 * Generate Valibot schemas and types
 * @param models - The models to generate the Valibot schemas and types for
 * @param config - The configuration for the generator
 * @returns The generated Valibot schemas and types
 */
export function generateValibot(models: readonly Model[], config: Config) {
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
      comment: isValibotDocumentValidation(field.documentation),
      validation: isValibotValidation(field.documentation),
    }))
    return fields
  })

  // null exclude
  const validFields = isFieldsValidation(modelFields)
  // group by model
  const groupedByModel = groupByModelHelper(validFields)

  const valibots = Object.values(groupedByModel).map((fields) => {
    return {
      generateValibotSchema: generateValibotSchemas(fields, config),
      generateValibotInfer:
        config.type === 'true' ? generateValibotInferInput(fields[0].modelName, config) : '',
    }
  })

  return [
    VALIBOT_IMPORT,
    '',
    valibots
      .flatMap(({ generateValibotSchema, generateValibotInfer }) =>
        [generateValibotSchema, generateValibotInfer].filter(Boolean),
      )
      .join('\n\n'),
  ].join('\n')
}
