export function fieldTypeLabel(field: {
  readonly type: string
  readonly isList: boolean
  readonly isRequired: boolean
}) {
  return `${field.type}${field.isList ? '[]' : ''}${field.isRequired || field.isList ? '' : '?'}`
}

export function firstLine(text: string | null) {
  return text?.split('\n')[0]?.trim() ?? ''
}
