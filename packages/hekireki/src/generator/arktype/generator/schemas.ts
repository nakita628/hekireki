import { schemaFromFields } from '../../../shared/utils/index.js'
import { schema } from './schema.js'

/**
 * Generate properties for ArkType schema.
 */
function arktypePropertiesGenerator(
  fields: readonly {
    readonly documentation: string
    readonly modelName: string
    readonly fieldName: string
    readonly validation: string | null
    readonly comment: readonly string[]
  }[],
  comment: boolean,
): string {
  return fields
    .map((field) => {
      const commentLines = comment && field.comment.length > 0 ? field.comment.map((c) => `  /** ${c} */`).join('\n') + '\n' : ''
      return `${commentLines}  ${field.fieldName}: ${field.validation ?? '"unknown"'},`
    })
    .join('\n')
}

/**
 * Creates ArkType schemas from model fields.
 *
 * @param modelFields - The fields of the model
 * @param comment - Whether to include comments in the generated code
 * @returns The generated ArkType schemas
 */
export function schemas(
  modelFields: readonly {
    readonly documentation: string
    readonly modelName: string
    readonly fieldName: string
    readonly validation: string | null
    readonly comment: readonly string[]
  }[],
  comment: boolean,
): string {
  return schemaFromFields(modelFields, comment, schema, arktypePropertiesGenerator)
}
