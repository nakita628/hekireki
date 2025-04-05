import type { GroupedFields, ValidField } from '../type'

/**
 * Groups valid fields by model name.
 *
 * @param validFields - The array of valid fields.
 * @returns The grouped fields.
 */
export function groupByModelHelper(validFields: ValidField[]): GroupedFields {
  return validFields.reduce<GroupedFields>((acc, field) => {
    if (!acc[field.modelName]) {
      acc[field.modelName] = []
    }
    acc[field.modelName].push(field)
    return acc
  }, {})
}
