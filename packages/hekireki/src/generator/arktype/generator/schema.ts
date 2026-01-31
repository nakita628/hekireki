/**
 * Generate ArkType schema
 * @param modelName - The name of the model
 * @param fields - The fields of the model
 * @returns The generated ArkType schema
 */
export function schema(
  modelName: string,
  fields: string,
): `export const ${string}Schema = type({\n${string}\n})` {
  return `export const ${modelName}Schema = type({\n${fields}\n})`
}
