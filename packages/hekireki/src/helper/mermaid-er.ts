import type { DMMF } from '@prisma/generator-helper'
import { stripAnnotations } from '../utils/index.js'

// ============================================================================
// Relation Utilities
// ============================================================================

export function isRelationshipType(
  type: string,
): type is 'zero-one' | 'one' | 'zero-many' | 'many' {
  return type === 'zero-one' || type === 'one' || type === 'zero-many' || type === 'many'
}

export function parseRelation(line: string): {
  readonly fromModel: string
  readonly fromField: string
  readonly toModel: string
  readonly toField: string
  readonly type: string
} | null {
  const relationRegex = /^@relation\s+(\w+)\.(\w+)\s+(\w+)\.(\w+)\s+(\w+-to-\w+)$/
  const match = line.trim().match(relationRegex)

  if (!match) {
    return null
  }

  const [, fromModel, fromField, toModel, toField, relationType] = match

  return {
    fromModel,
    fromField,
    toModel,
    toField,
    type: relationType,
  }
}

export function removeDuplicateRelations(relations: readonly string[]): readonly string[] {
  return [...new Set(relations)]
}

const RELATIONSHIPS = {
  'zero-one': '|o',
  one: '||',
  'zero-many': '}o',
  many: '}|',
} as const

type RelationshipKey = keyof typeof RELATIONSHIPS

// ============================================================================
// Composite functions (built from atomic utils)
// ============================================================================

export function makeRelationLine(
  input: string,
): { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: string } {
  const parts = input.split('-to-')
  if (parts.length !== 2) {
    return { ok: false, error: `Invalid input format: ${input}` }
  }
  const [toRaw, optionalFlag] = parts[1].includes('-optional')
    ? [parts[1].replace('-optional', ''), 'optional']
    : [parts[1], '']
  const from = parts[0]
  const to = toRaw
  const isOptional = optionalFlag === 'optional'
  if (!isRelationshipType(from)) {
    return { ok: false, error: `Invalid relationship: ${from}` }
  }
  if (!isRelationshipType(to)) {
    return { ok: false, error: `Invalid relationship: ${to}` }
  }
  const fromSymbol = RELATIONSHIPS[from]
  const toSymbol = RELATIONSHIPS[to]
  const connector = isOptional ? '..' : '--'
  return { ok: true, value: `${fromSymbol}${connector}${toSymbol}` }
}

export function makeRelationLineFromRelation(relation: {
  fromModel: string
  toModel: string
  fromField: string
  toField: string
  type: string
}): { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: string } {
  const result = makeRelationLine(relation.type)

  if (!result.ok) {
    return result
  }

  return {
    ok: true,
    value: `    ${relation.fromModel} ${result.value} ${relation.toModel} : "(${relation.fromField}) - (${relation.toField})"`,
  }
}

// ============================================================================
// Mermaid ER Generation
// ============================================================================

export function modelFields(model: DMMF.Model): string[] {
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
      const commentPart = stripAnnotations(field.documentation) ?? ''

      const keyMarker = field.isId ? 'PK' : fkFields.has(field.name) ? 'FK' : ''
      const keyPart = keyMarker ? ` ${keyMarker}` : ''
      const fieldType = field.type.toLowerCase()

      return `        ${fieldType} ${field.name}${keyPart}${commentPart ? ` "${commentPart}"` : ''}`
    })
    .filter((field): field is string => field !== null)
}

export function modelInfo(model: DMMF.Model): readonly string[] {
  return [`    ${model.name} {`, ...modelFields(model), '    }'] as const
}

export function extractRelationsFromDmmf(models: readonly DMMF.Model[]): readonly string[] {
  return models.flatMap((model) =>
    model.fields
      .filter(
        (field) =>
          field.kind === 'object' &&
          field.relationFromFields &&
          field.relationFromFields.length > 0,
      )
      .map((field) => {
        const toModel = model.name
        const fromModel = field.type
        const toField = field.relationFromFields?.[0]
        const fromField = field.relationToFields?.[0] ?? 'id'

        const fromCardinality: RelationshipKey = 'one'

        const relatedModel = models.find((m) => m.name === fromModel)
        const inverseField = relatedModel?.fields.find(
          (f) => f.relationName === field.relationName && f.name !== field.name,
        )

        const toCardinality: RelationshipKey = inverseField?.isList
          ? field.isRequired
            ? 'many'
            : 'zero-many'
          : field.isRequired
            ? 'one'
            : 'zero-one'

        const fromSymbol = RELATIONSHIPS[fromCardinality]
        const toSymbol = RELATIONSHIPS[toCardinality]
        const connector = '--'

        return `    ${fromModel} ${fromSymbol}${connector}${toSymbol} ${toModel} : "(${fromField}) - (${toField})"`
      }),
  )
}

export function extractRelations(model: DMMF.Model): readonly string[] {
  if (!model.documentation) {
    return []
  }

  return model.documentation
    .split('\n')
    .map((line: string) => {
      const relation = parseRelation(line)
      if (!relation) return null
      const result = makeRelationLineFromRelation(relation)
      return result.ok ? result.value : null
    })
    .filter((line): line is string => line !== null)
}

// ER diagram header / footer
const ER_HEADER = ['```mermaid', 'erDiagram'] as const
const ER_FOOTER = ['```'] as const

export function erContent(models: readonly DMMF.Model[]): readonly string[] {
  const allRelations = extractRelationsFromDmmf(models)
  const uniqueRelations = removeDuplicateRelations(allRelations)
  const modelInfos = models.flatMap(modelInfo)
  return [...ER_HEADER, ...uniqueRelations, ...modelInfos, ...ER_FOOTER]
}
