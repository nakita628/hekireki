import type { DMMF } from '@prisma/generator-helper'

import { parseRelation } from '../utils/index.js'

export type Cardinality = 'zero-one' | 'one' | 'zero-many' | 'many'

export type ERRelation = {
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
  readonly identifying: boolean
  readonly origin: 'inferred' | 'annotated'
}

function isCardinality(value: string | undefined): value is Cardinality {
  return value === 'zero-one' || value === 'one' || value === 'zero-many' || value === 'many'
}

export function erKey(relation: {
  readonly from: { readonly model: string; readonly field: string }
  readonly to: { readonly model: string; readonly field: string }
}) {
  return `${relation.from.model}.${relation.from.field}->${relation.to.model}.${relation.to.field}`
}

export function inferredERRelations(models: readonly DMMF.Model[]) {
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
        const toField = field.relationFromFields?.[0] ?? ''
        const fromField = field.relationToFields?.[0] ?? 'id'

        const relatedModel = models.find((m) => m.name === fromModel)
        const inverseField = relatedModel?.fields.find(
          (f) => f.relationName === field.relationName && f.name !== field.name,
        )

        const toCardinality: Cardinality = inverseField?.isList
          ? field.isRequired
            ? 'many'
            : 'zero-many'
          : field.isRequired
            ? 'one'
            : 'zero-one'

        return {
          from: { model: fromModel, field: fromField, cardinality: 'one' },
          to: { model: toModel, field: toField, cardinality: toCardinality },
          identifying: true,
          origin: 'inferred',
        } as const
      }),
  )
}

export function annotatedERRelations(models: readonly { readonly documentation?: string }[]) {
  return models.flatMap((model) =>
    (model.documentation ?? '').split('\n').flatMap((line) => {
      const relation = parseRelation(line)
      if (relation === null) return []
      const [fromCard, toCard] = relation.type.split('-to-')
      if (!isCardinality(fromCard) || !isCardinality(toCard)) return []
      return [
        {
          from: { model: relation.fromModel, field: relation.fromField, cardinality: fromCard },
          to: { model: relation.toModel, field: relation.toField, cardinality: toCard },
          identifying: true,
          origin: 'annotated',
        } as const,
      ]
    }),
  )
}

// Merges inferred (physical FK) and annotated (`/// @relation`) relations into a
// single render-agnostic list consumed by the Mermaid and DBML generators.
// Inferred relations seed the order; an annotation for the same pair overwrites
// the entry's cardinality in place while keeping `origin: 'inferred'` (a physical
// FK still exists); annotation-only pairs (no FK) append at the end with
// `origin: 'annotated'`. Duplicate annotations are last-wins.
export function mergeERRelations(models: readonly DMMF.Model[]): readonly ERRelation[] {
  const inferred = inferredERRelations(models)
  const annotated = annotatedERRelations(models)
  const inferredKeys = new Set(inferred.map(erKey))

  const merged = new Map([
    ...inferred.map((r) => [erKey(r), r] as const),
    ...annotated.map(
      (r) =>
        [
          erKey(r),
          inferredKeys.has(erKey(r)) ? ({ ...r, origin: 'inferred' } as const) : r,
        ] as const,
    ),
  ])

  return [...merged.values()]
}
