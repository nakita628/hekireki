import type { DMMF } from '@prisma/generator-helper'

import { parseRelation } from '../utils/index.js'

export type Cardinality = 'zero-one' | 'one' | 'zero-many' | 'many'

export type RelationOrigin = 'inferred' | 'annotated' | 'implicit-many-to-many'

export type ERRelation = {
  /** The `@relation` name the relation carries, when it has one. */
  readonly name: string | null
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
  readonly origin: RelationOrigin
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

/** The other side of the relation the field belongs to: same relation name, pointing back, and
 *  not the field itself — which is what tells the two ends of a self relation apart. */
function inverseOf(
  field: DMMF.Field,
  owner: DMMF.Model,
  related: DMMF.Model | undefined,
): DMMF.Field | undefined {
  return related?.fields.find(
    (f) =>
      f.kind === 'object' &&
      f.relationName === field.relationName &&
      f.type === owner.name &&
      !(related.name === owner.name && f.name === field.name),
  )
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
        const inverseField = inverseOf(field, model, relatedModel)

        // The parent end answers "how many parents does one child row have?": exactly one, or
        // none when the foreign key is nullable.
        const fromCardinality: Cardinality = field.isRequired ? 'one' : 'zero-one'
        // The child end answers "how many children does one parent row have?". A list back
        // relation has no lower bound in Prisma, so it is always zero or many; a one-to-one back
        // relation carries its own optionality.
        const toCardinality: Cardinality = inverseField?.isList
          ? 'zero-many'
          : inverseField?.isRequired
            ? 'one'
            : 'zero-one'

        return {
          name: field.relationName ?? null,
          from: { model: fromModel, field: fromField, cardinality: fromCardinality },
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
          name: null,
          from: { model: relation.fromModel, field: relation.fromField, cardinality: fromCard },
          to: { model: relation.toModel, field: relation.toField, cardinality: toCard },
          identifying: true,
          origin: 'annotated',
        } as const,
      ]
    }),
  )
}

// Implicit many-to-many relations: both ends are lists without `@relation(fields:)`, so Prisma
// keeps the pairs in a join table of its own. Emitted once per pair, keyed on the two relation
// field names so the order the models are declared in does not matter.
export function implicitManyToManyERRelations(models: readonly DMMF.Model[]) {
  return models.flatMap((model) =>
    model.fields
      .filter((f) => f.kind === 'object' && f.isList && (f.relationFromFields ?? []).length === 0)
      .flatMap((field) => {
        const other = models.find((m) => m.name === field.type)
        const inverse = inverseOf(field, model, other)
        if (!(other && inverse?.isList)) return []
        if (`${model.name}.${field.name}` > `${other.name}.${inverse.name}`) return []
        return [
          {
            name: field.relationName ?? null,
            from: { model: model.name, field: field.name, cardinality: 'zero-many' },
            to: { model: other.name, field: inverse.name, cardinality: 'zero-many' },
            identifying: false,
            origin: 'implicit-many-to-many',
          } as const,
        ]
      }),
  )
}

// Merges inferred (physical FK) and annotated (`/// @relation`) relations into a
// single render-agnostic list consumed by the Mermaid and DBML generators.
// Inferred relations seed the order; an annotation for the same pair overwrites
// the entry's cardinality in place while keeping `origin: 'inferred'` and the
// relation name (a physical FK still exists); annotation-only pairs (no FK)
// append at the end with `origin: 'annotated'`. Duplicate annotations are last-wins.
export function mergeERRelations(models: readonly DMMF.Model[]): readonly ERRelation[] {
  const inferred = inferredERRelations(models)
  const annotated = annotatedERRelations(models)
  const inferredByKey = new Map(inferred.map((r) => [erKey(r), r] as const))

  const merged = new Map<string, ERRelation>([
    ...inferred.map((r) => [erKey(r), r] as const),
    ...annotated.map((r) => {
      const physical = inferredByKey.get(erKey(r))
      return [
        erKey(r),
        physical ? ({ ...r, name: physical.name, origin: 'inferred' } as const) : r,
      ] as const
    }),
  ])

  return [...merged.values()]
}

/** Every relation an ER diagram draws: foreign keys, `/// @relation` and implicit many-to-many. */
export function erRelations(models: readonly DMMF.Model[]): readonly ERRelation[] {
  return [...mergeERRelations(models), ...implicitManyToManyERRelations(models)]
}
