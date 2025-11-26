import { schemaFromFields } from '../../../shared/utils/index.js'
import { properties } from '../utils/index.js'
import { schema } from './schema.js'

/**
 * Creates Valibot schemas from model fields.
 *
 * @param modelFields - The fields of the model
 * @param comment - Whether to include comments in the generated code
 * @returns The generated Valibot schemas
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
  return schemaFromFields(modelFields, comment, schema, properties)
}
