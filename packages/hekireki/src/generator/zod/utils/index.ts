import type { DMMF } from '@prisma/generator-helper'
import { extractAnno } from '../../../shared/utils/index.js'

/**
 * Creates `z.infer` type for the specified model.
 *
 * @param modelName - The name of the model.
 * @returns The generated TypeScript type definition line using Zod.
 */
export function infer(
  modelName: string,
): `export type ${string} = z.infer<typeof ${string}Schema>` {
  return `export type ${modelName} = z.infer<typeof ${modelName}Schema>`
}

/**
 * Creates Zod property definitions from model fields.
 *
 * @param modelFields - The list of model fields with documentation and validation info.
 * @param comment - Whether to include JSDoc comments for each field.
 * @returns A string containing formatted Zod property definitions.
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

      return `${docComment}  ${field.fieldName}: z.${field.validation}`
    })
    .join(',\n')
  return fields
}

/**
 * Parses documentation and removes Zod validation lines.
 *
 * @param documentation - The documentation string to parse.
 * @returns An array of non-Zod documentation lines.
 */
export function isZodDocument(documentation?: string): readonly string[] {
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
 * @param documentation - The documentation string to parse.
 * @returns The Zod validation string without the "@z." prefix, or null if not found.
 */
export function isZod(documentation?: string): string | null {
  if (!documentation) return null
  const match = documentation.match(/@z\.(.+?)(?:\n|$)/)
  return match ? match[1].trim() : null
}

/**
 * Wraps expression with array/optional based on field cardinality.
 *
 * @param expr - The base expression
 * @param field - The field metadata
 * @returns The wrapped expression
 */
export function wrapCardinality(expr: string, field: DMMF.Field): string {
  const withList = field.isList ? `z.array(${expr})` : expr
  return field.isRequired ? withList : `${withList}.optional()`
}

/**
 * Builds Zod object definition with optional strictness.
 *
 * @param inner - The inner fields definition
 * @param documentation - The model documentation
 * @returns The Zod object definition
 */
export function buildZodObject(inner: string, documentation?: string): string {
  const anno = extractAnno(documentation ?? '', '@z.')
  return anno === 'strictObject'
    ? `z.strictObject({${inner}})`
    : anno === 'looseObject'
      ? `z.looseObject({${inner}})`
      : `z.object({${inner}})`
}
