// What completion offers when there are no types to ask: the keys each Prisma input type takes,
// followed from the schema's models through the path of keys the cursor sits under.
import type { CursorContext } from './cursor.js'
import { delegateOf, OPERATIONS } from './operations.js'

/** A field as completion needs it: its name, its Prisma type, and whether it is a relation or a list. */
type CompletionField = {
  readonly name: string
  readonly type: string
  readonly kind: string
  readonly isList: boolean
}

export type CompletionModel = { readonly name: string; readonly fields: readonly CompletionField[] }

type Suggestion = {
  readonly label: string
  readonly detail: string
  readonly kind: 'model' | 'operation' | 'argument' | 'field'
}

/** The shapes that are only a model: what each takes follows from the model alone. */
type ModelKind =
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

type Shape =
  | { readonly kind: 'args'; readonly model: CompletionModel; readonly operation: string }
  | { readonly kind: ModelKind; readonly model: CompletionModel }
  | { readonly kind: 'relation'; readonly model: CompletionModel; readonly list: boolean }
  | { readonly kind: 'write'; readonly model: CompletionModel; readonly list: boolean }
  | { readonly kind: 'filter'; readonly field: CompletionField }
  | { readonly kind: 'none' }

/** A relation field and the model it leads to. */
type Relation = { readonly field: CompletionField; readonly model: CompletionModel }

/** Where a key is written: the model it is a key of, and the field it names there, if any. */
type KeyAt = {
  readonly model: CompletionModel
  readonly key: string
  readonly field: CompletionField | undefined
  readonly relation: Relation | null
}

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
] as const

const NUMERIC = new Set(['Int', 'BigInt', 'Float', 'Decimal', 'DateTime'])

/** The keys of an operation's arguments (or a relation's) and the shape each leads to. */
const ARGS_STEPS = new Map<string, ModelKind>([
  ['where', 'where'],
  ['having', 'where'],
  ['cursor', 'where'],
  ['select', 'select'],
  ['include', 'include'],
  ['omit', 'omit'],
  ['orderBy', 'orderBy'],
  ['data', 'data'],
  ['create', 'data'],
  ['update', 'data'],
  ['_avg', 'fields'],
  ['_sum', 'fields'],
  ['_min', 'fields'],
  ['_max', 'fields'],
])

const LOGICAL_KEYS = new Set(['AND', 'OR', 'NOT'])
const LIST_FILTER_KEYS = new Set(['some', 'every', 'none'])
const NESTED_WRITE_KEYS = new Set(['createMany', 'connectOrCreate', 'upsert', 'updateMany'])
const WHERE_WRITE_KEYS = new Set(['connect', 'disconnect', 'set', 'delete', 'deleteMany'])

/** One key down from the arguments; `_count` counts fields only where the operation is not one. */
function stepFromArgs(model: CompletionModel, key: string, countsFields: boolean): Shape {
  if (key === '_count') return countsFields ? { kind: 'fields', model } : NONE
  const kind = ARGS_STEPS.get(key)
  return kind === undefined ? NONE : { kind, model }
}

function stepFromWhere({ model, key, field, relation }: KeyAt, takesIs: boolean): Shape {
  if (LOGICAL_KEYS.has(key)) return { kind: 'where', model }
  if (takesIs && (key === 'is' || key === 'isNot')) return { kind: 'where', model }
  if (relation !== null) {
    return { kind: relation.field.isList ? 'someEveryNone' : 'isIsNot', model: relation.model }
  }
  return field === undefined ? NONE : { kind: 'filter', field }
}

function stepFromSelect({ model, key, relation }: KeyAt): Shape {
  if (key === '_count') return { kind: 'count', model }
  return relation === null
    ? NONE
    : { kind: 'relation', model: relation.model, list: relation.field.isList }
}

function stepFromOrderBy({ relation }: KeyAt): Shape {
  if (relation === null) return NONE
  return relation.field.isList
    ? { kind: 'fields', model: relation.model }
    : { kind: 'orderBy', model: relation.model }
}

function stepFromData({ relation }: KeyAt): Shape {
  return relation === null
    ? NONE
    : { kind: 'write', model: relation.model, list: relation.field.isList }
}

function stepFromWrite(model: CompletionModel, key: string, list: boolean): Shape {
  if (key === 'create') return { kind: 'data', model }
  if (NESTED_WRITE_KEYS.has(key)) return { kind: 'nested', model }
  if (key === 'update') return list ? { kind: 'nested', model } : { kind: 'data', model }
  return WHERE_WRITE_KEYS.has(key) ? { kind: 'where', model } : NONE
}

const MODEL_STEPS: { readonly [K in ModelKind]: (at: KeyAt) => Shape } = {
  where: (at) => stepFromWhere(at, false),
  isIsNot: (at) => stepFromWhere(at, true),
  someEveryNone: ({ model, key }) => (LIST_FILTER_KEYS.has(key) ? { kind: 'where', model } : NONE),
  select: stepFromSelect,
  include: stepFromSelect,
  count: ({ model, key }) => (key === 'select' ? { kind: 'countFields', model } : NONE),
  orderBy: stepFromOrderBy,
  data: stepFromData,
  nested: ({ model, key }) => stepFromArgs(model, key, false),
  omit: () => NONE,
  fields: () => NONE,
  countFields: () => NONE,
}

/** The shape one key down from `shape`, as Prisma Client's input types nest. */
function step(shape: Shape, key: string, models: readonly CompletionModel[]): Shape {
  if (shape.kind === 'none' || shape.kind === 'filter') {
    return shape.kind === 'filter' && key === 'not' ? shape : NONE
  }
  const { model } = shape
  if (shape.kind === 'args') return stepFromArgs(model, key, shape.operation !== 'count')
  if (shape.kind === 'relation') return stepFromArgs(model, key, false)
  if (shape.kind === 'write') return stepFromWrite(model, key, shape.list)
  const field = model.fields.find((candidate) => candidate.name === key)
  const related = field?.kind === 'object' ? models.find((m) => m.name === field.type) : undefined
  const relation = field === undefined || related === undefined ? null : { field, model: related }
  return MODEL_STEPS[shape.kind]({ model, key, field, relation })
}

function argument(label: string, detail: string): Suggestion {
  return { label, detail, kind: 'argument' }
}

function fieldSuggestion(field: CompletionField): Suggestion {
  return { label: field.name, detail: `${field.type}${field.isList ? '[]' : ''}`, kind: 'field' }
}

/** The filters a scalar field takes, by its type. */
function filtersOf(field: CompletionField): readonly string[] {
  if (field.isList) return ['has', 'hasEvery', 'hasSome', 'isEmpty', 'equals']
  if (field.kind === 'enum') return ['equals', 'not', 'in', 'notIn']
  if (field.type === 'String') {
    return [
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
  }
  if (NUMERIC.has(field.type)) return ['equals', 'not', 'in', 'notIn', 'lt', 'lte', 'gt', 'gte']
  if (field.type === 'Json') return ['equals', 'not', 'path', 'string_contains', 'array_contains']
  return ['equals', 'not']
}

const NESTED_WRITES_TO_MANY = [
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

const NESTED_WRITES_TO_ONE = [
  'create',
  'connect',
  'connectOrCreate',
  'disconnect',
  'delete',
  'update',
  'upsert',
]

const MODEL_KEYS: {
  readonly [K in ModelKind]: (model: CompletionModel) => readonly Suggestion[]
} = {
  where: (model) => [
    ...model.fields.map(fieldSuggestion),
    ...['AND', 'OR', 'NOT'].map((label) => argument(label, `${model.name}WhereInput`)),
  ],
  isIsNot: (model) => [
    ...['is', 'isNot'].map((label) => argument(label, `${model.name}WhereInput`)),
    ...model.fields.map(fieldSuggestion),
  ],
  someEveryNone: (model) =>
    ['some', 'every', 'none'].map((label) => argument(label, `${model.name}WhereInput`)),
  select: (model) => [...model.fields.map(fieldSuggestion), argument('_count', 'relation counts')],
  include: (model) => [
    ...model.fields.filter((field) => field.kind === 'object').map(fieldSuggestion),
    argument('_count', 'relation counts'),
  ],
  count: () => [argument('select', 'the relations to count')],
  countFields: (model) =>
    model.fields.filter((field) => field.kind === 'object' && field.isList).map(fieldSuggestion),
  omit: (model) => model.fields.filter((field) => field.kind !== 'object').map(fieldSuggestion),
  fields: (model) => model.fields.filter((field) => field.kind !== 'object').map(fieldSuggestion),
  orderBy: (model) => model.fields.map(fieldSuggestion),
  data: (model) => model.fields.map(fieldSuggestion),
  nested: (model) =>
    ['where', 'create', 'update', 'data', 'skipDuplicates'].map((label) =>
      argument(label, model.name),
    ),
}

/** The keys the Prisma input type of a shape takes. */
function keysOf(shape: Shape): readonly Suggestion[] {
  if (shape.kind === 'none') return []
  if (shape.kind === 'filter') {
    const { field } = shape
    return filtersOf(field).map((label) => argument(label, `${field.type} filter`))
  }
  const { model } = shape
  if (shape.kind === 'args') {
    const { operation } = shape
    return (OPERATIONS[operation]?.args ?? []).map((label) =>
      argument(label, `${model.name}.${operation}`),
    )
  }
  if (shape.kind === 'relation') {
    return (shape.list ? RELATION_ARGS : ['select', 'include', 'omit']).map((label) =>
      argument(label, model.name),
    )
  }
  if (shape.kind === 'write') {
    return (shape.list ? NESTED_WRITES_TO_MANY : NESTED_WRITES_TO_ONE).map((label) =>
      argument(label, `nested write to ${model.name}`),
    )
  }
  return MODEL_KEYS[shape.kind](model)
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
  return keysOf(shape)
}
