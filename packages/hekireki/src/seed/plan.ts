import type { DMMF } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { SeedGenerationError } from './errors.js'

export type EnumMember = { readonly name: string; readonly dbName: string }

/** One insertable column: the Prisma field it holds and the database column it is written to. */
export type SeedColumn = {
  readonly field: string
  readonly column: string
  readonly type: string
  readonly kind: 'scalar' | 'enum'
  readonly isList: boolean
  readonly enumValues: readonly EnumMember[] | null
}

/** A foreign key of a model: the relation field, the scalar fields it is stored in, and where it points. */
export type ForeignKey = {
  readonly field: string
  readonly fromFields: readonly string[]
  readonly toModel: string
  readonly toFields: readonly string[]
  readonly required: boolean
  /** The from-fields are a unique constraint of the model, so every parent may be used once. */
  readonly oneToOne: boolean
  readonly self: boolean
}

export type ModelTable = {
  readonly kind: 'model'
  readonly name: string
  readonly table: string
  readonly schema: string | null
  readonly model: DMMF.Model
  readonly columns: readonly SeedColumn[]
  readonly foreignKeys: readonly ForeignKey[]
  readonly uniques: readonly (readonly string[])[]
  readonly autoincrement: readonly string[]
}

export type JoinSide = {
  readonly model: string
  readonly field: string
  readonly idField: string
  readonly column: 'A' | 'B'
  readonly type: string
  readonly kind: 'scalar' | 'enum'
  readonly enumValues: readonly EnumMember[] | null
}

/** The table Prisma keeps an implicit many-to-many relation in: `_PostToTag`, columns `A` and `B`. */
export type JoinTable = {
  readonly kind: 'join'
  readonly name: string
  readonly table: string
  readonly schema: string | null
  readonly sides: readonly [JoinSide, JoinSide]
}

export type SeedTable = ModelTable | JoinTable

function isForeignKeyField(field: DMMF.Field) {
  return field.kind === 'object' && (field.relationFromFields ?? []).length > 0
}

function isImplicitListField(field: DMMF.Field) {
  return field.kind === 'object' && field.isList && (field.relationFromFields ?? []).length === 0
}

function inverseOf(field: DMMF.Field, owner: DMMF.Model, related: DMMF.Model | undefined) {
  return related?.fields.find(
    (f) =>
      f.kind === 'object' &&
      f.relationName === field.relationName &&
      f.type === owner.name &&
      !(related.name === owner.name && f.name === field.name),
  )
}

function enumMembers(enums: readonly DMMF.DatamodelEnum[], type: string) {
  const declared = enums.find((e) => e.name === type)
  return declared === undefined
    ? null
    : declared.values.map((value) => ({ name: value.name, dbName: value.dbName ?? value.name }))
}

/** The `@default(fn(args))` of a field as name and arguments, or null for a literal or no default. */
export function fieldDefault(field: DMMF.Field) {
  return typeof field.default === 'object' && 'name' in field.default
    ? { name: field.default.name, args: field.default.args }
    : null
}

function defaultName(field: DMMF.Field) {
  return fieldDefault(field)?.name ?? null
}

function uniqueSets(model: DMMF.Model) {
  const singles = model.fields
    .filter((f) => f.kind !== 'object' && (f.isUnique || f.isId))
    .map((f) => [f.name] as const)
  const composite = [
    ...(model.primaryKey === null ? [] : [model.primaryKey.fields]),
    ...model.uniqueFields,
  ]
  const all: readonly (readonly string[])[] = [...singles, ...composite]
  return all.filter(
    (set, index) => all.findIndex((other) => other.join(' ') === set.join(' ')) === index,
  )
}

/** The scalar fields other models' foreign keys point at, so their values must exist. */
function referencedFields(models: readonly DMMF.Model[], target: string) {
  return new Set(
    models.flatMap((model) =>
      model.fields
        .filter((f) => isForeignKeyField(f) && f.type === target)
        .flatMap((f) => f.relationToFields ?? []),
    ),
  )
}

function makeModelTable(
  model: DMMF.Model,
  models: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[],
): ModelTable {
  const referenced = referencedFields(models, model.name)
  const uniques = uniqueSets(model)
  const columns = model.fields
    .filter((f): f is DMMF.Field & { readonly kind: 'scalar' | 'enum' } => {
      if (f.kind !== 'scalar' && f.kind !== 'enum') return false
      // The database fills these itself; a generated value would only shadow the expression.
      if (defaultName(f) === 'dbgenerated' && !f.isId && !referenced.has(f.name)) return false
      return true
    })
    .map((f) => ({
      field: f.name,
      column: f.dbName ?? f.name,
      type: f.type,
      kind: f.kind,
      isList: f.isList,
      enumValues: f.kind === 'enum' ? enumMembers(enums, f.type) : null,
    }))
  const foreignKeys = model.fields.filter(isForeignKeyField).map((f) => {
    const fromFields = f.relationFromFields ?? []
    const key = [...fromFields].toSorted().join(' ')
    return {
      field: f.name,
      fromFields,
      toModel: f.type,
      toFields: f.relationToFields ?? [],
      required: f.isRequired,
      oneToOne: uniques.some((set) => [...set].toSorted().join(' ') === key),
      self: f.type === model.name,
    }
  })
  return {
    kind: 'model',
    name: model.name,
    table: model.dbName ?? model.name,
    schema: model.schema,
    model,
    columns,
    foreignKeys,
    uniques,
    autoincrement: model.fields
      .filter((f) => defaultName(f) === 'autoincrement')
      .map((f) => f.name),
  }
}

function joinSide(
  model: DMMF.Model,
  field: DMMF.Field,
  column: 'A' | 'B',
  enums: readonly DMMF.DatamodelEnum[],
): JoinSide {
  const id = model.fields.find((f) => f.isId) ?? model.fields[0]
  return {
    model: model.name,
    field: field.name,
    idField: id?.name ?? 'id',
    column,
    type: id?.type ?? 'Int',
    kind: id?.kind === 'enum' ? 'enum' : 'scalar',
    enumValues: id?.kind === 'enum' ? enumMembers(enums, id.type) : null,
  }
}

/** Every implicit many-to-many relation once, as the join table Prisma creates for it. */
function makeJoinTables(models: readonly DMMF.Model[], enums: readonly DMMF.DatamodelEnum[]) {
  return models.flatMap((model) =>
    model.fields.filter(isImplicitListField).flatMap((field): readonly JoinTable[] => {
      const other = models.find((m) => m.name === field.type)
      const inverse = inverseOf(field, model, other)
      if (other === undefined || inverse === undefined || !inverse.isList) return []
      // Emitted from the side that sorts first; a self relation is emitted from its first field.
      const first = model.name === other.name ? field.name < inverse.name : model.name < other.name
      if (!first) return []
      const name = `_${field.relationName ?? `${model.name}To${other.name}`}`
      return [
        {
          kind: 'join',
          name,
          table: name,
          schema: model.schema,
          sides: [joinSide(model, field, 'A', enums), joinSide(other, inverse, 'B', enums)],
        },
      ]
    }),
  )
}

type Visit = {
  readonly order: readonly string[]
  readonly done: ReadonlySet<string>
  readonly cycle: string | null
}

/** A model on the DFS path, and whether the foreign key that led to it was optional. */
type Frame = { readonly name: string; readonly optional: boolean }

/**
 * Models in insert order: every model after the models its foreign keys point at.
 *
 * A cycle that runs through an optional foreign key is broken there: the model that owns the
 * optional key is inserted first with that key null, so the models it points at can come after
 * it. A cycle made of required keys only cannot be inserted in any order and is reported.
 */
function orderModels(tables: readonly ModelTable[]) {
  const byName = new Map(tables.map((table) => [table.name, table] as const))
  function visitDependencies(
    dependencies: readonly ForeignKey[],
    stack: readonly Frame[],
    state: Visit,
  ): Visit & { readonly deferred: boolean } {
    const [fk, ...rest] = dependencies
    if (fk === undefined || state.cycle !== null) return { ...state, deferred: false }
    const at = stack.findIndex((frame) => frame.name === fk.toModel)
    if (at === -1) {
      return visitDependencies(rest, stack, visit(fk.toModel, !fk.required, stack, state))
    }
    if (!fk.required) return visitDependencies(rest, stack, state)
    // A required key back into the path: fine when the path got here over an optional key,
    // which is seeded null; fatal when every key on the way is required.
    if (stack.slice(at + 1).some((frame) => frame.optional)) {
      return { ...state, deferred: true }
    }
    const names = [...stack.slice(at).map((frame) => frame.name), fk.toModel]
    return { order: state.order, done: state.done, cycle: names.join(' -> '), deferred: false }
  }
  function visit(name: string, optional: boolean, stack: readonly Frame[], state: Visit): Visit {
    if (state.cycle !== null || state.done.has(name)) return state
    const table = byName.get(name)
    if (table === undefined) return state
    const dependencies = table.foreignKeys
      .filter((fk) => !fk.self)
      .toSorted((a, b) => Number(b.required) - Number(a.required))
    const visited = visitDependencies(dependencies, [...stack, { name, optional }], state)
    if (visited.cycle !== null) return visited
    // Deferred: a model up the path must be inserted first; this one is placed by a later visit.
    if (visited.deferred) return { order: visited.order, done: visited.done, cycle: null }
    return {
      order: [...visited.order, name],
      done: new Set([...visited.done, name]),
      cycle: null,
    }
  }
  function visitAll(names: readonly string[], state: Visit): Visit {
    const [name, ...rest] = names
    return name === undefined ? state : visitAll(rest, visit(name, false, [], state))
  }
  return visitAll(
    tables.map((table) => table.name),
    { order: [], done: new Set(), cycle: null },
  )
}

/**
 * The tables to seed, in an order every foreign key can be satisfied in: models by dependency,
 * then the join tables of the implicit many-to-many relations.
 */
export function makeSeedPlan(datamodel: DMMF.Datamodel) {
  return Effect.gen(function* () {
    const tables = datamodel.models.map((model) =>
      makeModelTable(model, datamodel.models, datamodel.enums),
    )
    const visited = orderModels(tables)
    if (visited.cycle !== null) {
      return yield* new SeedGenerationError({
        message: `Required relations form a cycle: ${visited.cycle}.\n   Make one of them optional so the seeder can insert the models in order.`,
      })
    }
    const ordered = visited.order.flatMap((name) => tables.filter((table) => table.name === name))
    const all: readonly SeedTable[] = [
      ...ordered,
      ...makeJoinTables(datamodel.models, datamodel.enums),
    ]
    return all
  })
}
