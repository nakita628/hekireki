import type { DMMF } from '@prisma/generator-helper'
import { modelFields } from './model-fields.js'

/**
 * Generate Mermaid ER diagram model block from a Prisma model.
 *
 * @param model - A Prisma DMMF model definition.
 * @returns An array of strings representing the model block in Mermaid ER syntax.
 */
export function modelInfo(model: DMMF.Model): readonly string[] {
  return [`    ${model.name} {`, ...modelFields(model), '    }'] as const
}
