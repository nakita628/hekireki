import type { DMMF } from '@prisma/generator-helper'
import { validationSchemas } from '../../../shared/utils/index.js'
import { inferInput, isValibot, isValibotDocument } from '../utils/index.js'
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
    parseDocument: isValibotDocument,
    extractValidation: isValibot,
    inferType: inferInput,
    schemas,
  })
}
