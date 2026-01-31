import type { DMMF } from '@prisma/generator-helper'

const ZOD_ANNOTATION = '@z.'
const VALIBOT_ANNOTATION = '@v.'
const RELATION_ANNOTATION = '@relation'

/**
 * Convert Prisma type to lowercase Mermaid ER type.
 */
function toMermaidType(prismaType: string): string {
  return prismaType.toLowerCase()
}

/**
 * Generate Mermaid ER field lines from a Prisma model.
 *
 * @param model - A Prisma DMMF model definition.
 * @returns An array of strings representing each field in Mermaid ER syntax, excluding relation fields and annotations.
 */
export function modelFields(model: DMMF.Model): string[] {
  // Collect foreign key field names from relation fields
  const fkFields = new Set(
    model.fields
      .filter((f) => f.relationFromFields && f.relationFromFields.length > 0)
      .flatMap((f) => f.relationFromFields ?? []),
  )

  return model.fields
    .map((field) => {
      if (field.relationName) {
        return null
      }
      const commentPart = field.documentation
        ? field.documentation
            .split('\n')
            .filter(
              (line) =>
                !(
                  line.includes(ZOD_ANNOTATION) ||
                  line.includes(VALIBOT_ANNOTATION) ||
                  line.includes(RELATION_ANNOTATION)
                ),
            )
            .join('\n')
            .trim()
        : ''

      // Determine key marker
      const keyMarker = field.isId ? 'PK' : fkFields.has(field.name) ? 'FK' : ''
      const keyPart = keyMarker ? ` ${keyMarker}` : ''
      const fieldType = toMermaidType(field.type)

      return `        ${fieldType} ${field.name}${keyPart}${commentPart ? ` "${commentPart}"` : ''}`
    })
    .filter((field): field is string => field !== null)
}
