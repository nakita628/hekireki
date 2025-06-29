import type { Config } from '../index.js'

/**
 * Generate Zod properties
 * @param modelFields - The fields of the model
 * @param config - The configuration for the generator
 * @returns The generated Zod properties
 */
export function properties(
  modelFields: {
    documentation: string
    modelName: string
    fieldName: string
    validation: string | null
    comment: string[]
  }[],
  config?: Config,
): string {
  const fields = modelFields
    .filter((field) => field.validation)
    .map((field) => {
      // @relation, @v, @z exclude
      const cleanDoc = field.comment
        .filter(
          (line) => !(line.includes('@relation') || line.includes('@v') || line.includes('@z')),
        )
        .join('\n')
        .trim()

      const docComment = config?.comment && cleanDoc ? `  /**\n   * ${cleanDoc}\n   */\n` : ''

      return `${docComment}  ${field.fieldName}: z.${field.validation}`
    })
    .join(',\n')
  return fields
}
