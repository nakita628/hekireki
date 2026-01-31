import { makePropertiesGenerator } from 'utils-lab'
import { schemaFromFields } from '../../../shared/utils/index.js'
import { schema } from './schema.js'

/**
 * Creates Zod schemas from model fields.
 *
 * @param modelFields - The fields of the model
 * @param comment - Whether to include comments in the generated code
 * @returns The generated Zod schemas
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
  return schemaFromFields(modelFields, comment, schema, makePropertiesGenerator('z'))
}
