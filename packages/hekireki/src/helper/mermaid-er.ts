import type { DMMF } from '@prisma/generator-helper'

import { stripAnnotations } from '../utils/index.js'
import type { Cardinality } from './relation.js'

// Mermaid spells a cardinality differently on each side of the line, so that both crow's feet
// open away from the entity they touch. https://mermaid.js.org/syntax/entityRelationshipDiagram.html
const LEFT = {
  'zero-one': '|o',
  one: '||',
  'zero-many': '}o',
  many: '}|',
} as const satisfies Record<Cardinality, string>

const RIGHT = {
  'zero-one': 'o|',
  one: '||',
  'zero-many': 'o{',
  many: '|{',
} as const satisfies Record<Cardinality, string>

export function escapeComment(comment: string) {
  return comment.replaceAll(/\r?\n/gu, ' ').replaceAll('"', '#quot;')
}

export function erRelationLine(
  relation: {
    readonly from: {
      readonly model: string
      readonly field: string
      readonly cardinality: Cardinality
    }
    readonly to: {
      readonly model: string
      readonly field: string
      readonly cardinality: Cardinality
    }
  },
  resolveName: (model: string) => string = (model) => model,
) {
  return `    ${resolveName(relation.from.model)} ${LEFT[relation.from.cardinality]}--${RIGHT[relation.to.cardinality]} ${resolveName(relation.to.model)} : "(${relation.from.field}) - (${relation.to.field})"`
}

/** The `PK` / `FK` / `UK` markers Mermaid draws beside an attribute, in that order. */
function keyMarkers(
  field: DMMF.Field,
  primaryKey: ReadonlySet<string>,
  foreignKeys: ReadonlySet<string>,
  uniques: ReadonlySet<string>,
) {
  return [
    field.isId || primaryKey.has(field.name) ? 'PK' : null,
    foreignKeys.has(field.name) ? 'FK' : null,
    field.isUnique || uniques.has(field.name) ? 'UK' : null,
  ].filter((marker) => marker !== null)
}

export function modelFields(model: DMMF.Model) {
  const fkFields = new Set(
    model.fields
      .filter((f) => f.relationFromFields && f.relationFromFields.length > 0)
      .flatMap((f) => f.relationFromFields ?? []),
  )
  const primaryKey = new Set(model.primaryKey?.fields)
  // Mermaid has one marker per column and no notion of a constraint over several of them, so
  // every column of a `@@unique` is marked; the DBML and image output keep the grouping.
  const uniques = new Set(model.uniqueFields.flat())

  return model.fields
    .map((field) => {
      if (field.relationName) return null
      const commentPart = stripAnnotations(field.documentation) ?? ''
      const markers = keyMarkers(field, primaryKey, fkFields, uniques)
      const keyPart = markers.length > 0 ? ` ${markers.join(', ')}` : ''
      const type = `${field.type.toLowerCase()}${field.isList ? '[]' : ''}`
      return `        ${type} ${field.name}${keyPart}${commentPart ? ` "${escapeComment(commentPart)}"` : ''}`
    })
    .filter((field) => field !== null)
}

export function modelInfo(model: DMMF.Model) {
  const entity = model.dbName ?? model.name
  return [`    ${entity} {`, ...modelFields(model), '    }']
}
