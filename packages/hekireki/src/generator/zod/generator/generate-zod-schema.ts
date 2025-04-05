import type { Config } from '..'
import { getVariableSchemaNameHelper } from '../../../common/helper/get-variable-schema-name-helper'

/**
 * Generate Zod schema
 * @param modelName - The name of the model
 * @param fields - The fields of the model
 * @param config - The configuration for the generator
 * @returns The generated Zod schema
 */
export function generateZodSchema(modelName: string, fields: string, config: Config) {
  const schemaName = getVariableSchemaNameHelper(modelName, config)
  return `export const ${schemaName} = z.object({\n${fields}\n})`
}
