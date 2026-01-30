import type { DMMF } from '@prisma/generator-helper'
import { makeDocumentParser, makeValidationExtractor, makeValibotInfer } from 'utils-lab'
import { validationSchemas } from '../../../shared/utils/index.js'
import { schemas } from './schemas.js'

/**
 * Creates Valibot schemas and types from models.
 *
 * @param models - The models to generate the Valibot schemas and types for
 * @param type - Whether to generate types
 * @param comment - Whether to include comments in the generated code
 * @returns The generated Valibot schemas and types
 */
export function valibot(models: readonly DMMF.Model[], type: boolean, comment: boolean): string {
  return validationSchemas(models, type, comment, {
    importStatement: `import * as v from 'valibot'`,
    annotationPrefix: '@v.',
    parseDocument: makeDocumentParser('@v.'),
    extractValidation: makeValidationExtractor('@v.'),
    inferType: makeValibotInfer,
    schemas,
  })
}
