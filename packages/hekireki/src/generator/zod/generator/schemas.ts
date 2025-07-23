import { properties } from '../utils/index.js'
import { schema } from './index.js'

/**
 * Generate Zod schemas
 * @param modelFields - The fields of the model
 * @param config - The configuration for the generator
 * @returns The generated Zod schemas
 */
export function schemas(
  modelFields: {
    documentation: string
    modelName: string
    fieldName: string
    validation: string | null
    comment: string[]
  }[],
  comment: boolean,
) {
  const modelName = modelFields[0].modelName
  const modelDoc = modelFields[0].documentation || ''
  const fields = properties(modelFields, comment)
  if (!(modelDoc || !comment)) {
    return schema(modelName, fields)
  }

  return `${schema(modelName, fields)}`
}
