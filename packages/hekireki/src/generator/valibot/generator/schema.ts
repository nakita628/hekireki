/**
 * Generate Valibot schema
 * @param modelName - The name of the model
 * @param fields - The fields of the model
 * @returns The generated Valibot schema
 */
export function schema(modelName: string, fields: string) {
  return `export const ${modelName} = v.object({\n${fields}\n})`
}
