import type { DMMF } from '@prisma/generator-helper'
import { makeValidationExtractor } from 'utils-lab'
import { parseDocumentWithoutAnnotations } from '../../../shared/helper/document-parser.js'
import { validationSchemas } from '../../../shared/utils/index.js'
import { schemas } from './schemas.js'

/**
 * Generate Effect Schema infer type statement.
 * @param modelName - The name of the model
 * @returns The generated type inference statement
 */
function makeEffectInfer(modelName: string): string {
  return `export type ${modelName} = Schema.Schema.Type<typeof ${modelName}Schema>`
}

/**
 * Creates Effect schemas and types from models.
 *
 * @param models - The models to generate the Effect schemas and types for
 * @param type - Whether to generate types
 * @param comment - Whether to include comments in the generated code
 * @returns The generated Effect schemas and types
 */
export function effect(models: readonly DMMF.Model[], type: boolean, comment: boolean): string {
  return validationSchemas(models, type, comment, {
    importStatement: `import { Schema } from 'effect'`,
    annotationPrefix: '@e.',
    parseDocument: parseDocumentWithoutAnnotations,
    extractValidation: makeValidationExtractor('@e.'),
    inferType: makeEffectInfer,
    schemas,
  })
}
