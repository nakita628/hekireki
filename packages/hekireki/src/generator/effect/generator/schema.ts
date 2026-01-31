/**
 * Generate Effect Schema
 * @param modelName - The name of the model
 * @param fields - The fields of the model
 * @returns The generated Effect Schema
 */
export function schema(
  modelName: string,
  fields: string,
): `export const ${string}Schema = Schema.Struct({\n${string}\n})` {
  return `export const ${modelName}Schema = Schema.Struct({\n${fields}\n})`
}
