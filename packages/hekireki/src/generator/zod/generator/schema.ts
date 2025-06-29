import type { Config } from '../index.js'

/**
 * Generate Zod schema
 * @param modelName - The name of the model
 * @param fields - The fields of the model
 * @param config - The configuration for the generator
 * @returns The generated Zod schema
 */
export function schema(modelName: string, fields: string) {
  return `export const ${modelName}Schema = z.object({\n${fields}\n})`
}
