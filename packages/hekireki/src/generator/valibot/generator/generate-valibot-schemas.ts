import type { Config } from '..'
import { generateValibotProperties } from './generate-valibot-properties'
import { generateValibotSchema } from './generate-valibot-schema'

/**
 * generate valibot schemas
 * @function generateValibotSchemas
 * @param modelFields
 * @param config
 * @returns
 */
export function generateValibotSchemas(
  modelFields: {
    documentation: string
    modelName: string
    fieldName: string
    validation: string | null
    comment: string[]
  }[],
  config: Config,
) {
  const modelName = modelFields[0].modelName
  const modelDoc = modelFields[0].documentation || ''

  const fields = generateValibotProperties(modelFields, config)

  if (!(modelDoc || !config?.comment)) {
    return generateValibotSchema(modelName, fields, config)
  }

  return `${generateValibotSchema(modelName, fields, config)}`
}
