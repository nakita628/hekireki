import type { DMMF } from '@prisma/generator-helper'

import { stripAnnotations } from '../utils/index.js'
import type { Cardinality, ERRelation } from './relation.js'

const RELATIONSHIPS = {
  'zero-one': '|o',
  one: '||',
  'zero-many': '}o',
  many: '}|',
} as const satisfies Record<Cardinality, string>

export function erRelationLine(relation: ERRelation) {
  return `    ${relation.from.model} ${RELATIONSHIPS[relation.from.cardinality]}--${RELATIONSHIPS[relation.to.cardinality]} ${relation.to.model} : "(${relation.from.field}) - (${relation.to.field})"`
}

export function modelFields(model: DMMF.Model) {
  const fkFields = new Set(
    model.fields
      .filter((f) => f.relationFromFields && f.relationFromFields.length > 0)
      .flatMap((f) => f.relationFromFields ?? []),
  )

  return model.fields
    .map((field) => {
      if (field.relationName) return null
      const commentPart = stripAnnotations(field.documentation) ?? ''
      const keyMarker = field.isId ? 'PK' : fkFields.has(field.name) ? 'FK' : ''
      const keyPart = keyMarker ? ` ${keyMarker}` : ''
      return `        ${field.type.toLowerCase()} ${field.name}${keyPart}${commentPart ? ` "${commentPart}"` : ''}`
    })
    .filter((field): field is string => field !== null)
}

export function modelInfo(model: DMMF.Model) {
  return [`    ${model.name} {`, ...modelFields(model), '    }']
}
