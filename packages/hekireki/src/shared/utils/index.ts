/**
 * Capitalize the first letter of a string.
 *
 * @param str - The input string.
 * @returns A new string with the first letter capitalized.
 */
export function capitalize(str: string): string {
  return `${str.charAt(0).toUpperCase()}${str.slice(1)}`
}

/**
 * Convert a camelCase or PascalCase string to snake_case.
 *
 * @param name - The input string in camelCase or PascalCase.
 * @returns The converted string in snake_case.
 */
export function snakeCase(name: string): string {
  return `${name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}`
}

/**
 * Group valid fields by their model name.
 *
 * @param validFields - An array of field objects with validation metadata.
 * @returns An object mapping each model name to its corresponding array of fields.
 */
export function groupByModel(
  validFields: Required<{
    documentation: string
    modelName: string
    fieldName: string
    comment: string[]
    validation: string | null
  }>[],
): Record<
  string,
  {
    documentation: string
    modelName: string
    fieldName: string
    comment: string[]
    validation: string | null
  }[]
> {
  return validFields.reduce<
    Record<
      string,
      {
        documentation: string
        modelName: string
        fieldName: string
        comment: string[]
        validation: string | null
      }[]
    >
  >((acc, field) => {
    if (!acc[field.modelName]) {
      acc[field.modelName] = []
    }
    acc[field.modelName].push(field)
    return acc
  }, {})
}

/**
 * Extract fields with validation from a nested array of model fields.
 *
 * @param modelFields - A nested array of model field definitions.
 * @returns A flat array of fields that include a non-null `validation` property.
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
  return modelFields.flat().filter(
    (
      field,
    ): field is Required<{
      documentation: string
      modelName: string
      fieldName: string
      comment: string[]
      validation: string | null
    }> => field.validation !== null,
  )
}
