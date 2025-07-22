import type { DMMF } from '@prisma/generator-helper'

const ZOD_ANNOTATION = '@z.'
const VALIBOT_ANNOTATION = '@v.'

/**
 * Generate Mermaid ER field lines from a Prisma model.
 *
 * @param model - A Prisma DMMF model definition.
 * @returns An array of strings representing each field in Mermaid ER syntax, excluding relation fields and annotations.
 */
export function modelFields(model: DMMF.Model): string[] {
  return model.fields
    .map((field) => {
      if (field.relationName) {
        return null
      }
      const commentPart = field.documentation
        ? field.documentation
            .split('\n')
            .filter((line) => !(line.includes(ZOD_ANNOTATION) || line.includes(VALIBOT_ANNOTATION)))
            .join('\n')
            .trim()
        : ''

      return `        ${field.type} ${field.name} ${commentPart ? `"${commentPart}"` : ''}`
    })
    .filter((field): field is string => field !== null)
}
