import type { ValidField } from '../type'

/**
 * Is fields validation
 * @param modelFields - The model fields
 * @returns The fields validation
 */
export function isFieldsValidation(
  modelFields: {
    documentation: string
    modelName: string
    fieldName: string
    comment: string[]
    validation: string | null
  }[][],
) {
  return modelFields.flat().filter((field): field is ValidField => field.validation !== null)
}
