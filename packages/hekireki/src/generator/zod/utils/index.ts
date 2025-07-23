/**
 * Generate Zod infer
 *
 * @param modelName - The name of the model
 * @param config - The configuration for the generator
 * @returns The generated Zod infer
 */
export function infer(modelName: string) {
  return `export type ${modelName} = z.infer<typeof ${modelName}Schema>`
}

/**
 * Generate Zod properties
 *
 * @param modelFields - The fields of the model
 * @param config - The configuration for the generator
 * @returns The generated Zod properties
 */
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
  comment: boolean,
): string {
  const fields = modelFields
    .filter((field) => field.validation)
    .map((field) => {
      const cleanDoc = field.comment
        .filter(
          (line) => !(line.includes('@relation') || line.includes('@v') || line.includes('@z')),
        )
        .join('\n')
        .trim()
      const docComment = comment && cleanDoc ? `  /**\n   * ${cleanDoc}\n   */\n` : ''
      return `${docComment}  ${field.fieldName}: z.${field.validation}`
    })
    .join(',\n')
  return fields
}

/**
 * Parses documentation and removes Zod validation lines.
 *
 * Lines containing "@z." are excluded from the result.
 *
 * @param documentation - The documentation string to parse.
 * @returns An array of non-Zod documentation lines.
 */
export function isZodDocument(documentation?: string): string[] {
  return (
    documentation
      ?.split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.includes('@z.')) ?? []
  )
}

/**
 * Extracts the Zod validation expression from documentation.
 *
 * Searches for a line starting with "@z." and returns the expression part.
 *
 * @param documentation - The documentation string to parse.
 * @returns The Zod validation string without the "@z." prefix, or null if not found.
 */
export function isZod(documentation?: string): string | null {
  if (!documentation) return null
  const match = documentation.match(/@z\.(.+?)(?:\n|$)/)
  return match ? match[1].trim() : null
}
