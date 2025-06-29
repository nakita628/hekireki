/**
 * Generate the infer input type for the model
 * @param modelName - The name of the model
 * @param config - The configuration for the generator
 * @returns The generated infer input type
 */
export function inferInput(modelName: string) {
  return `export type ${modelName} = v.InferInput<typeof ${modelName}Schema>`
}
