import type { DMMF } from '@prisma/generator-helper'

import { stripAnnotations } from '../utils/index.js'

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
  const match = line.trim().match(/^@relation\s+(\w+)\.(\w+)\s+(\w+)\.(\w+)\s+(\w+-to-\w+)$/)
  if (!match) return null
  const [, fromModel, fromField, toModel, toField, type] = match
  return { fromModel, fromField, toModel, toField, type }
}

export function removeDuplicateRelations(relations: readonly string[]) {
  return [...new Set(relations)]
}

const RELATIONSHIPS = {
  'zero-one': '|o',
  one: '||',
  'zero-many': '}o',
  many: '}|',
} as const

export function makeRelationLine(
  input: string,
): { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: string } {
  const parts = input.split('-to-')
  if (parts.length !== 2) return { ok: false, error: `Invalid input format: ${input}` }
  const [to, optionalFlag] = parts[1].includes('-optional')
    ? [parts[1].replace('-optional', ''), 'optional']
    : [parts[1], '']
  const from = parts[0]
  if (!isRelationshipType(from)) return { ok: false, error: `Invalid relationship: ${from}` }
  if (!isRelationshipType(to)) return { ok: false, error: `Invalid relationship: ${to}` }
  return {
    ok: true,
    value: `${RELATIONSHIPS[from]}${optionalFlag === 'optional' ? '..' : '--'}${RELATIONSHIPS[to]}`,
  }
}

export function makeRelationLineFromRelation(relation: {
  fromModel: string
  toModel: string
  fromField: string
  toField: string
  type: string
}): { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: string } {
  const result = makeRelationLine(relation.type)
  if (!result.ok) return result
  return {
    ok: true,
    value: `    ${relation.fromModel} ${result.value} ${relation.toModel} : "(${relation.fromField}) - (${relation.toField})"`,
  }
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
  return [`    ${model.name} {`, ...modelFields(model), '    }'] as const
}

export function extractRelationsFromDmmf(models: readonly DMMF.Model[]) {
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

        const relatedModel = models.find((m) => m.name === fromModel)
        const inverseField = relatedModel?.fields.find(
          (f) => f.relationName === field.relationName && f.name !== field.name,
        )

        const toCardinality = inverseField?.isList
          ? field.isRequired
            ? 'many'
            : 'zero-many'
          : field.isRequired
            ? 'one'
            : 'zero-one'

        return `    ${fromModel} ${RELATIONSHIPS.one}--${RELATIONSHIPS[toCardinality]} ${toModel} : "(${fromField}) - (${toField})"`
      }),
  )
}

export function extractRelations(model: DMMF.Model) {
  if (!model.documentation) return []
  return model.documentation
    .split('\n')
    .map((line) => {
      const relation = parseRelation(line)
      if (!relation) return null
      const result = makeRelationLineFromRelation(relation)
      return result.ok ? result.value : null
    })
    .filter((line): line is string => line !== null)
}

const ER_HEADER = ['```mermaid', 'erDiagram'] as const
const ER_FOOTER = ['```'] as const

export function erContent(models: readonly DMMF.Model[]) {
  const allRelations = extractRelationsFromDmmf(models)
  const uniqueRelations = removeDuplicateRelations(allRelations)
  const modelInfos = models.flatMap(modelInfo)
  return [...ER_HEADER, ...uniqueRelations, ...modelInfos, ...ER_FOOTER]
}
