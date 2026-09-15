// What completion offers when there are no types to ask: the keys each Prisma input type takes,
// followed from the schema's models through the path of keys the cursor sits under.
import type { CursorContext } from './cursor.js'
import { delegateOf, OPERATIONS } from './operations.js'

/** A field as completion needs it: its name, its Prisma type, and whether it is a relation or a list. */
export type CompletionField = {
  readonly name: string
  readonly type: string
  readonly kind: string
  readonly isList: boolean
}

export type CompletionModel = { readonly name: string; readonly fields: readonly CompletionField[] }

export type Suggestion = {
  readonly label: string
  readonly detail: string
  readonly kind: 'model' | 'operation' | 'argument' | 'field'
}

type Shape =
  | { readonly kind: 'args'; readonly model: CompletionModel; readonly operation: string }
  | {
      readonly kind:
        | 'where'
        | 'someEveryNone'
        | 'isIsNot'
        | 'select'
        | 'include'
        | 'omit'
        | 'orderBy'
        | 'data'
        | 'nested'
        | 'fields'
        | 'count'
        | 'countFields'
      readonly model: CompletionModel
    }
  | { readonly kind: 'relation' | 'write'; readonly model: CompletionModel; readonly list: boolean }
  | { readonly kind: 'filter'; readonly field: CompletionField }
  | { readonly kind: 'none' }

const NONE: Shape = { kind: 'none' }

const RELATION_ARGS = [
  'select',
  'include',
  'omit',
  'where',
  'orderBy',
  'cursor',
  'take',
  'skip',
  'distinct',
]

const NUMERIC = new Set(['Int', 'BigInt', 'Float', 'Decimal', 'DateTime'])

/** The shape one key down from `shape`, as Prisma Client's input types nest. */
function step(shape: Shape, key: string, models: readonly CompletionModel[]): Shape {
  if (shape.kind === 'none' || shape.kind === 'filter') {
    return shape.kind === 'filter' && key === 'not' ? shape : NONE
  }
  const { model } = shape
  const field = model.fields.find((candidate) => candidate.name === key)
  const related = field?.kind === 'object' ? models.find((m) => m.name === field.type) : undefined
  const at = (kind: 'where' | 'select' | 'include' | 'omit' | 'orderBy' | 'data' | 'fields') => ({
    kind,
    model,
  })
  switch (shape.kind) {
    case 'args':
    case 'relation':
    case 'nested': {
      if (key === 'where' || key === 'having' || key === 'cursor') return at('where')
      if (key === 'select' || key === 'include' || key === 'omit' || key === 'orderBy') {
        return at(key)
      }
      if (key === 'data' || key === 'create' || key === 'update') return at('data')
      if (key === '_count') {
        return shape.kind === 'args' && shape.operation !== 'count' ? at('fields') : NONE
      }
      return key === '_avg' || key === '_sum' || key === '_min' || key === '_max'
        ? at('fields')
        : NONE
    }
    case 'where':
    case 'isIsNot': {
      if (key === 'AND' || key === 'OR' || key === 'NOT') return at('where')
      if (shape.kind === 'isIsNot' && (key === 'is' || key === 'isNot')) return at('where')
      if (related !== undefined && field !== undefined) {
        return { kind: field.isList ? 'someEveryNone' : 'isIsNot', model: related }
      }
      return field === undefined ? NONE : { kind: 'filter', field }
    }
    case 'someEveryNone':
      return key === 'some' || key === 'every' || key === 'none' ? at('where') : NONE
    case 'select':
    case 'include': {
      if (key === '_count') return { kind: 'count', model }
      return related !== undefined && field !== undefined
        ? { kind: 'relation', model: related, list: field.isList }
        : NONE
    }
    case 'count':
      return key === 'select' ? { kind: 'countFields', model } : NONE
    case 'orderBy': {
      if (related === undefined || field === undefined) return NONE
      return field.isList ? { kind: 'fields', model: related } : { kind: 'orderBy', model: related }
    }
    case 'data':
      return related !== undefined && field !== undefined
        ? { kind: 'write', model: related, list: field.isList }
        : NONE
    case 'write': {
      if (key === 'create') return { kind: 'data', model }
      if (key === 'createMany') return { kind: 'nested', model }
      if (key === 'connectOrCreate' || key === 'upsert' || key === 'updateMany') {
        return { kind: 'nested', model }
      }
      if (key === 'update') return shape.list ? { kind: 'nested', model } : { kind: 'data', model }
      return ['connect', 'disconnect', 'set', 'delete', 'deleteMany'].includes(key)
        ? { kind: 'where', model }
        : NONE
    }
    case 'omit':
    case 'fields':
    case 'countFields':
      return NONE
    default:
      return shape satisfies never
  }
}

function argument(label: string, detail: string): Suggestion {
  return { label, detail, kind: 'argument' }
}

function fieldSuggestion(field: CompletionField): Suggestion {
  return { label: field.name, detail: `${field.type}${field.isList ? '[]' : ''}`, kind: 'field' }
}

/**
 * What to offer at the cursor: the model delegates (and `$transaction`), the operations of a
 * delegate, or the keys the Prisma input type at that depth takes — fields of the model the
 * keys lead to, filters of a scalar field, `some` / `every` / `none` under a list relation.
 */
export function suggestionsAt(
  context: CursorContext,
  models: readonly CompletionModel[],
): readonly Suggestion[] {
  if (context.kind === 'delegate') {
    return [
      ...models.map((model): Suggestion => ({
        label: delegateOf(model.name),
        detail: `model ${model.name}`,
        kind: 'model',
      })),
      { label: '$transaction', detail: 'run several calls as one batch', kind: 'operation' },
    ]
  }
  const delegate = models.find((candidate) => delegateOf(candidate.name) === context.delegate)
  if (delegate === undefined) return []
  if (context.kind === 'operation') {
    return Object.entries(OPERATIONS).map(([label, operation]) => ({
      label,
      detail: `${operation.write ? 'write' : 'read'} · ${operation.detail}`,
      kind: 'operation',
    }))
  }
  const shape = context.path.reduce<Shape>((current, key) => step(current, key, models), {
    kind: 'args',
    model: delegate,
    operation: context.operation,
  })
  if (shape.kind === 'none') return []
  if (shape.kind === 'filter') {
    const { field } = shape
    const filters = field.isList
      ? ['has', 'hasEvery', 'hasSome', 'isEmpty', 'equals']
      : field.kind === 'enum'
        ? ['equals', 'not', 'in', 'notIn']
        : field.type === 'String'
          ? [
              'equals',
              'not',
              'in',
              'notIn',
              'contains',
              'startsWith',
              'endsWith',
              'mode',
              'lt',
              'lte',
              'gt',
              'gte',
            ]
          : NUMERIC.has(field.type)
            ? ['equals', 'not', 'in', 'notIn', 'lt', 'lte', 'gt', 'gte']
            : field.type === 'Json'
              ? ['equals', 'not', 'path', 'string_contains', 'array_contains']
              : ['equals', 'not']
    return filters.map((label) => argument(label, `${field.type} filter`))
  }
  const { model } = shape
  const scalars = model.fields.filter((field) => field.kind !== 'object')
  const relations = model.fields.filter((field) => field.kind === 'object')
  switch (shape.kind) {
    case 'args':
      return (OPERATIONS[shape.operation]?.args ?? []).map((label) =>
        argument(label, `${model.name}.${shape.operation}`),
      )
    case 'where':
      return [
        ...model.fields.map(fieldSuggestion),
        ...['AND', 'OR', 'NOT'].map((label) => argument(label, `${model.name}WhereInput`)),
      ]
    case 'isIsNot':
      return [
        ...['is', 'isNot'].map((label) => argument(label, `${model.name}WhereInput`)),
        ...model.fields.map(fieldSuggestion),
      ]
    case 'someEveryNone':
      return ['some', 'every', 'none'].map((label) => argument(label, `${model.name}WhereInput`))
    case 'select':
      return [...model.fields.map(fieldSuggestion), argument('_count', 'relation counts')]
    case 'include':
      return [...relations.map(fieldSuggestion), argument('_count', 'relation counts')]
    case 'relation':
      return (shape.list ? RELATION_ARGS : ['select', 'include', 'omit']).map((label) =>
        argument(label, model.name),
      )
    case 'count':
      return [argument('select', 'the relations to count')]
    case 'countFields':
      return relations.filter((field) => field.isList).map(fieldSuggestion)
    case 'omit':
    case 'fields':
      return scalars.map(fieldSuggestion)
    case 'orderBy':
    case 'data':
      return model.fields.map(fieldSuggestion)
    case 'write':
      return (
        shape.list
          ? [
              'create',
              'createMany',
              'connect',
              'connectOrCreate',
              'disconnect',
              'set',
              'delete',
              'deleteMany',
              'update',
              'updateMany',
              'upsert',
            ]
          : ['create', 'connect', 'connectOrCreate', 'disconnect', 'delete', 'update', 'upsert']
      ).map((label) => argument(label, `nested write to ${model.name}`))
    case 'nested':
      return ['where', 'create', 'update', 'data', 'skipDuplicates'].map((label) =>
        argument(label, model.name),
      )
    default:
      return shape satisfies never
  }
}
