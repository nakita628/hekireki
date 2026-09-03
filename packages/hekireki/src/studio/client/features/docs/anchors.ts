import type { DocsField, DocsTypeRef } from '../../../server/routes/index.js'

/** The element id of an input type, output type or enum section. */
export function typeSectionId(kind: 'inputType' | 'outputType' | 'enum', name: string) {
  return `type-${kind}-${name}`
}

/**
 * The page anchor a type reference links to, decided by where Prisma declares the type: scalars
 * and field references have no section and are shown as text.
 */
export function typeRefAnchor(ref: Pick<DocsTypeRef, 'type' | 'location'>) {
  switch (ref.location) {
    case 'inputObjectTypes':
      return `#${typeSectionId('inputType', ref.type)}`
    case 'outputObjectTypes':
      return `#${typeSectionId('outputType', ref.type)}`
    case 'enumTypes':
      return `#${typeSectionId('enum', ref.type)}`
    case 'scalar':
    case 'fieldRefTypes':
      return null
    default:
      return ref.location satisfies never
  }
}

/** The page anchor a model field's type links to: relations open the model's output type, enums their section. */
export function fieldTypeAnchor(field: Pick<DocsField, 'bareTypeName' | 'kind'>) {
  switch (field.kind) {
    case 'object':
      return `#${typeSectionId('outputType', field.bareTypeName)}`
    case 'enum':
      return `#${typeSectionId('enum', field.bareTypeName)}`
    case 'scalar':
    case 'unsupported':
      return null
    default:
      return field.kind satisfies never
  }
}
