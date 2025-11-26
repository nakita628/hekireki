import { extractAnno, jsdoc } from '../../../shared/utils/index.js'

/**
 * Creates `v.InferInput` type for the specified model.
 *
 * @param modelName - The name of the model.
 * @returns The generated TypeScript type definition line.
 */
export function inferInput(
  modelName: string,
): `export type ${string} = v.InferInput<typeof ${string}Schema>` {
  return `export type ${modelName} = v.InferInput<typeof ${modelName}Schema>`
}

/**
 * Creates Valibot property definitions from model fields.
 *
 * @param modelFields - The list of model fields with metadata.
 * @param comment - Whether to include documentation comments.
 * @returns A string containing formatted Valibot property definitions.
 */
export function properties(
  modelFields: readonly {
    readonly documentation: string
    readonly modelName: string
    readonly fieldName: string
    readonly validation: string | null
    readonly comment: readonly string[]
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

      return `${docComment}  ${field.fieldName}: v.${field.validation}`
    })
    .join(',\n')
  return fields
}

/**
 * Parses documentation lines and filters out Valibot validation entries.
 *
 * @param documentation - The raw documentation string.
 * @returns An array of non-Valibot documentation lines.
 */
export function isValibotDocument(documentation?: string): readonly string[] {
  return (
    documentation
      ?.split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.includes('@v.')) ?? []
  )
}

/**
 * Extracts the Valibot validation expression from a documentation string.
 *
 * @param documentation - The documentation string to search.
 * @returns The Valibot expression without "@v." prefix, or null if not found.
 */
export function isValibot(documentation?: string): string | null {
  if (!documentation) return null
  const match = documentation.match(/@v\.(.+?)(?:\n|$)/)
  return match ? match[1].trim() : null
}

export { extractAnno, jsdoc }
