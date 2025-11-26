import type { DMMF } from '@prisma/generator-helper'
import {
  properties as buildProperties,
  extractAnno,
  extractValidation,
  inferTypeZod,
  jsdoc,
  parseDocExcluding,
} from '../../../shared/utils/index.js'

/**
 * Creates `z.infer` type for the specified model.
 *
 * @param modelName - The name of the model.
 * @returns The generated TypeScript type definition line using Zod.
 */
export function infer(
  modelName: string,
): `export type ${string} = z.infer<typeof ${string}Schema>` {
  return inferTypeZod(modelName)
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
  return buildProperties(modelFields, comment, 'z')
}

/**
 * Parses documentation and removes Zod validation lines.
 *
 * @param documentation - The documentation string to parse.
 * @returns An array of non-Zod documentation lines.
 */
export function isZodDocument(documentation?: string): readonly string[] {
  return parseDocExcluding(documentation, '@z.')
}

/**
 * Extracts the Zod validation expression from documentation.
 *
 * @param documentation - The documentation string to parse.
 * @returns The Zod validation string without the "@z." prefix, or null if not found.
 */
export function isZod(documentation?: string): string | null {
  return extractValidation(documentation, '@z.')
}

export { extractAnno, jsdoc }

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
