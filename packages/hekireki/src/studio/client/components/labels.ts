import type { Field } from '../../server/routes/index.js'

export function fieldTypeLabel(field: Field) {
  return `${field.type}${field.isList ? '[]' : ''}${field.isRequired || field.isList ? '' : '?'}`
}

export function firstLine(text: string | null) {
  return text?.split('\n')[0]?.trim() ?? ''
}
