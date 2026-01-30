import type { DMMF } from '@prisma/generator-helper'
import { makeValidationExtractor } from 'utils-lab'
import { parseDocumentWithoutAnnotations } from '../../../shared/helper/document-parser.js'
import { validationSchemas } from '../../../shared/utils/index.js'
import { schemas } from './schemas.js'

/**
 * Generate ArkType infer type statement.
 * @param modelName - The name of the model
 * @returns The generated type inference statement
 */
function makeArktypeInfer(modelName: string): string {
  return `export type ${modelName} = typeof ${modelName}Schema.infer`
}

/**
 * Creates ArkType schemas and types from models.
 *
 * @param models - The models to generate the ArkType schemas and types for
 * @param type - Whether to generate types
 * @param comment - Whether to include comments in the generated code
 * @returns The generated ArkType schemas and types
 */
export function arktype(models: readonly DMMF.Model[], type: boolean, comment: boolean): string {
  return validationSchemas(models, type, comment, {
    importStatement: `import { type } from 'arktype'`,
    annotationPrefix: '@a.',
    parseDocument: parseDocumentWithoutAnnotations,
    extractValidation: makeValidationExtractor('@a.'),
    inferType: makeArktypeInfer,
    schemas,
  })
}
