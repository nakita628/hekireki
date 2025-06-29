import type { Config } from '../index.js'
import { generateValibotProperties } from './properties.js'
import { schema } from './schema.js'

/**
 * generate valibot schemas
 * @param modelFields
 * @param config
 * @returns
 */
export function schemas(
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
    return schema(modelName, fields)
  }

  return `${schema(modelName, fields)}`
}
