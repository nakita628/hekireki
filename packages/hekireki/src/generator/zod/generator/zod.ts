import type { DMMF } from '@prisma/generator-helper'
import { makeValidationExtractor, makeZodInfer } from 'utils-lab'
import { parseDocumentWithoutAnnotations } from '../../../shared/helper/document-parser.js'
import { validationSchemas } from '../../../shared/utils/index.js'
import { schemas } from './schemas.js'

/**
 * Creates Zod schemas and types from models.
 *
 * @param models - The models to generate the Zod schemas and types for
 * @param type - Whether to generate types
 * @param comment - Whether to include comments in the generated code
 * @param zodVersion - The Zod version/variant to use
 * @returns The generated Zod schemas and types
 */
export function zod(
  models: readonly DMMF.Model[],
  type: boolean,
  comment: boolean,
  zodVersion?: string | string[],
): string {
  const importStatement =
    zodVersion === 'mini'
      ? `import * as z from 'zod/mini'`
      : zodVersion === '@hono/zod-openapi'
        ? `import { z } from '@hono/zod-openapi'`
        : `import * as z from 'zod'`

  return validationSchemas(models, type, comment, {
    importStatement,
    annotationPrefix: '@z.',
    parseDocument: parseDocumentWithoutAnnotations,
    extractValidation: makeValidationExtractor('@z.'),
    inferType: makeZodInfer,
    schemas,
  })
}
