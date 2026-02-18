import type { DMMF } from '@prisma/generator-helper'
import {
  makeRelationLineFromRelation,
  parseRelation,
  removeDuplicateRelations,
} from '../utils/index.js'

const ZOD_ANNOTATION = '@z.'
const VALIBOT_ANNOTATION = '@v.'
const RELATION_ANNOTATION = '@relation'

const RELATIONSHIPS = {
  'zero-one': '|o',
  one: '||',
  'zero-many': '}o',
  many: '}|',
} as const

type RelationshipKey = keyof typeof RELATIONSHIPS

function toMermaidType(prismaType: string): string {
  return prismaType.toLowerCase()
}

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
      const commentPart = field.documentation
        ? field.documentation
            .split('\n')
            .filter((line) => {
              const trimmed = line.trim()
              return !(
                trimmed.startsWith(ZOD_ANNOTATION) ||
                trimmed.startsWith(VALIBOT_ANNOTATION) ||
                trimmed.startsWith('@a.') ||
                trimmed.startsWith('@e.') ||
                trimmed.includes(RELATION_ANNOTATION) ||
                trimmed === '@z' ||
                trimmed === '@v' ||
                trimmed === '@a' ||
                trimmed === '@e'
              )
            })
            .join('\n')
            .trim()
        : ''

      const keyMarker = field.isId ? 'PK' : fkFields.has(field.name) ? 'FK' : ''
      const keyPart = keyMarker ? ` ${keyMarker}` : ''
      const fieldType = toMermaidType(field.type)

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
