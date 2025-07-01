import type { ValidField } from '../types.js'

/**
 * Is fields validation
 * @param modelFields - The model fields
 * @returns The fields validation
 */
export function isFields(
  modelFields: {
    documentation: string | undefined
    modelName: string
    fieldName: string
    comment: string[]
    validation: string | null
  }[][],
) {
  return modelFields.flat().filter((field): field is ValidField => field.validation !== null)
}
