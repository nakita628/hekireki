import type { DMMF } from '@prisma/generator-helper'

// What a Prisma schema says whichever database and language it is written for: the names a model
// and a field stand under, what a default asks for, and how the ends of a relation pair up.

export function tableName(model: DMMF.Model) {
  return model.dbName ?? model.name
}

export function columnName(field: DMMF.Field) {
  return field.dbName ?? field.name
}

export function isListDefault(
  def: DMMF.Field['default'],
): def is readonly (string | number | boolean)[] {
  return Array.isArray(def)
}

export function isFunctionDefault(
  def: DMMF.Field['default'],
): def is { readonly name: string; readonly args: readonly (string | number)[] } {
  return def !== null && typeof def === 'object' && !Array.isArray(def) && 'name' in def
}

export function isAutoincrement(field: DMMF.Field) {
  return isFunctionDefault(field.default) && field.default.name === 'autoincrement'
}

// `@default(now())` on a DateTime: the time of the insert, which Prisma Client writes.
export function isNowDefault(field: DMMF.Field) {
  return (
    field.type === 'DateTime' && isFunctionDefault(field.default) && field.default.name === 'now'
  )
}

// The version `@default(uuid())` asks for, 4 unless `uuid(7)`; null for any other default.
export function uuidDefaultVersion(field: DMMF.Field) {
  if (!(isFunctionDefault(field.default) && field.default.name === 'uuid')) return null
  return field.default.args[0] === 7 ? 7 : 4
}

export function isUlidDefault(field: DMMF.Field) {
  return isFunctionDefault(field.default) && field.default.name === 'ulid'
}

// The other end of a relation field: the same relation, on the related model, and — which is what
// tells the two ends of a self-relation apart — not the field itself.
export function backRelation(field: DMMF.Field, owner: DMMF.Model, models: readonly DMMF.Model[]) {
  const related = models.find((m) => m.name === field.type)
  return related?.fields.find(
    (f) =>
      f.kind === 'object' &&
      f.relationName === field.relationName &&
      f.type === owner.name &&
      !(related.name === owner.name && f.name === field.name),
  )
}

// A list relation field kept in an implicit join table: no `@relation(fields:)`, and its other end
// is a list too. In a self-relation the other end is another field, never the field itself.
export function isImplicitManyToMany(
  field: DMMF.Field,
  owner: DMMF.Model,
  models: readonly DMMF.Model[],
) {
  return (
    field.kind === 'object' &&
    field.isList &&
    (field.relationFromFields ?? []).length === 0 &&
    backRelation(field, owner, models)?.isList === true
  )
}

// Whether a field of an implicit many-to-many relation is on the side of column `A`: its model's
// name sorts first, or, in a self-relation, its own name sorts before its other end's.
export function isJoinSideA(field: DMMF.Field, owner: DMMF.Model, inverse: DMMF.Field) {
  return owner.name === field.type ? field.name < inverse.name : owner.name < field.type
}

/**
 * A relation field as an ORM declares it: the end that holds the foreign key (`belongsTo`), an end of
 * an implicit many-to-many, or the end a foreign key on the other model points back at (`hasMany`
 * for a list, `hasOne` otherwise). `inverse` is the other end; a `belongsTo` may have none.
 */
export type RelationEnd =
  | {
      readonly kind: 'belongsTo'
      readonly field: DMMF.Field
      readonly inverse: DMMF.Field | undefined
    }
  | {
      readonly kind: 'manyToMany'
      readonly field: DMMF.Field
      readonly inverse: DMMF.Field
      readonly isSideA: boolean
    }
  | {
      readonly kind: 'hasMany' | 'hasOne'
      readonly field: DMMF.Field
      readonly inverse: DMMF.Field
    }

// A model's relation fields in declaration order. The other end is the one `backRelation` finds:
// on the related model, of the same relation, pointing back at this model — another relation of
// the same name between other models, or the field itself in a self-relation, is not it.
export function relationEnds(model: DMMF.Model, models: readonly DMMF.Model[]) {
  return model.fields.flatMap((field): RelationEnd[] => {
    if (field.kind !== 'object') return []
    const inverse = backRelation(field, model, models)
    if ((field.relationFromFields ?? []).length > 0) return [{ kind: 'belongsTo', field, inverse }]
    if (!inverse) return []
    if (field.isList && inverse.isList) {
      return [{ kind: 'manyToMany', field, inverse, isSideA: isJoinSideA(field, model, inverse) }]
    }
    if ((inverse.relationFromFields ?? []).length === 0) return []
    return [{ kind: field.isList ? 'hasMany' : 'hasOne', field, inverse }]
  })
}

export type ManyToMany = {
  readonly relationName: string
  /** The side join column `A` belongs to. */
  readonly a: { readonly model: DMMF.Model; readonly field: DMMF.Field }
  /** The side join column `B` belongs to. */
  readonly b: { readonly model: DMMF.Model; readonly field: DMMF.Field }
}

// Prisma keeps an implicit many-to-many relation in `_<relation>`, a row per pair in columns `A`
// and `B`. `A` holds the id of the model whose name sorts first, and that model's relation field
// lists the `B` of its rows; in a self-relation both columns hold the same model's ids, and the
// field whose name sorts first is the one that lists `B`.
export function manyToManyRelations(models: readonly DMMF.Model[]) {
  return models.flatMap((model) =>
    model.fields
      .filter((f) => f.kind === 'object' && f.isList && (f.relationFromFields ?? []).length === 0)
      .flatMap((field): ManyToMany[] => {
        const inverse = backRelation(field, model, models)
        const other = models.find((m) => m.name === field.type)
        if (!(other && inverse?.isList)) return []
        if (!isJoinSideA(field, model, inverse)) return []
        return [
          {
            relationName: field.relationName ?? `${model.name}To${other.name}`,
            a: { model, field },
            b: { model: other, field: inverse },
          },
        ]
      }),
  )
}
