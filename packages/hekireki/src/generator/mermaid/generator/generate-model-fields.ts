import type { DMMF } from '@prisma/generator-helper'

const ZOD_ANNOTATION = '@z.'
const VALIBOT_ANNOTATION = '@v.'

/**
 * generate model fields
 * @param { DMMF.Model } model
 * @returns { string[] }
 */
export function generateModelFields(model: DMMF.Model): string[] {
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
