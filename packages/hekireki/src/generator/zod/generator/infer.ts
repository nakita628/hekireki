/**
 * Generate Zod infer
 * @param modelName - The name of the model
 * @param config - The configuration for the generator
 * @returns The generated Zod infer
 */
export function infer(modelName: string) {
  return `export type ${modelName} = z.infer<typeof ${modelName}Schema>`
}
