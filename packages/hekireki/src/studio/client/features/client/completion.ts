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

/** Where the cursor is, as far as completion cares. */
export type CursorContext =
  | { readonly kind: 'delegate'; readonly from: number }
  | { readonly kind: 'operation'; readonly delegate: string; readonly from: number }
  | {
      readonly kind: 'key'
      readonly delegate: string
      readonly operation: string
      readonly path: readonly string[]
      readonly from: number
    }

/** The model operations, each with what it does and the arguments it takes. */
export const OPERATIONS: Readonly<
  Record<
    string,
    { readonly write: boolean; readonly detail: string; readonly args: readonly string[] }
  >
> = {
  findMany: {
    write: false,
    detail: 'every matching row',
    args: ['where', 'select', 'include', 'omit', 'orderBy', 'cursor', 'take', 'skip', 'distinct'],
  },
  findFirst: {
    write: false,
    detail: 'the first matching row, or null',
    args: ['where', 'select', 'include', 'omit', 'orderBy', 'cursor', 'take', 'skip', 'distinct'],
  },
  findFirstOrThrow: {
    write: false,
    detail: 'the first matching row, or an error',
    args: ['where', 'select', 'include', 'omit', 'orderBy', 'cursor', 'take', 'skip', 'distinct'],
  },
  findUnique: {
    write: false,
    detail: 'the row with this unique key, or null',
    args: ['where', 'select', 'include', 'omit'],
  },
  findUniqueOrThrow: {
    write: false,
    detail: 'the row with this unique key, or an error',
    args: ['where', 'select', 'include', 'omit'],
  },
  count: {
    write: false,
    detail: 'how many rows match',
    args: ['where', 'select', 'orderBy', 'cursor', 'take', 'skip'],
  },
  aggregate: {
    write: false,
    detail: '_count, _avg, _sum, _min, _max',
    args: ['where', 'orderBy', 'cursor', 'take', 'skip', '_count', '_avg', '_sum', '_min', '_max'],
  },
  groupBy: {
    write: false,
    detail: 'aggregates per group',
    args: [
      'by',
      'where',
      'orderBy',
      'having',
      'take',
      'skip',
      '_count',
      '_avg',
      '_sum',
      '_min',
      '_max',
    ],
  },
  create: { write: true, detail: 'insert one row', args: ['data', 'select', 'include', 'omit'] },
  createMany: { write: true, detail: 'insert rows', args: ['data', 'skipDuplicates'] },
  createManyAndReturn: {
    write: true,
    detail: 'insert rows and return them',
    args: ['data', 'select', 'include', 'omit', 'skipDuplicates'],
  },
  update: {
    write: true,
    detail: 'change one row',
    args: ['where', 'data', 'select', 'include', 'omit'],
  },
  updateMany: {
    write: true,
    detail: 'change every matching row',
    args: ['where', 'data', 'limit'],
  },
  updateManyAndReturn: {
    write: true,
    detail: 'change matching rows and return them',
    args: ['where', 'data', 'select', 'include', 'omit', 'limit'],
  },
  upsert: {
    write: true,
    detail: 'update one row, or create it',
    args: ['where', 'create', 'update', 'select', 'include', 'omit'],
  },
  delete: { write: true, detail: 'delete one row', args: ['where', 'select', 'include', 'omit'] },
  deleteMany: { write: true, detail: 'delete every matching row', args: ['where', 'limit'] },
}

/** `User` → `user`: the property Prisma Client exposes a model under. */
export function delegateOf(model: string) {
  return `${model.charAt(0).toLowerCase()}${model.slice(1)}`
}

type Token = { readonly text: string; readonly start: number; readonly end: number }

const TOKEN =
  /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\[\s\S])*`?|[A-Za-z_$][\w$]*|\d[\w.]*|\S/gu

const NAME = /^[A-Za-z_$][\w$]*$/u

function isOpen(token: Token) {
  const quote = token.text[0] ?? ''
  if (token.text.startsWith('/*')) return !token.text.endsWith('*/') || token.text.length < 4
  if (token.text.startsWith('//')) return true
  return `"'\``.includes(quote) && (token.text.length < 2 || !token.text.endsWith(quote))
}

type Frame =
  | { readonly kind: 'call'; readonly delegate: string; readonly operation: string }
  | { readonly kind: 'object' | 'array'; readonly key: string | null }
  | { readonly kind: 'paren' }

/** The frames open at the end of the tokens, innermost last, and the key a value would belong to. */
function framesOf(tokens: readonly Token[]) {
  return tokens.reduce<{ readonly frames: readonly Frame[]; readonly key: string | null }>(
    (state, token, index) => {
      const previous = tokens[index - 1]?.text ?? ''
      if (token.text === ':' && (NAME.test(previous) || /^["']/u.test(previous))) {
        return { ...state, key: previous.replaceAll(/^["']|["']$/gu, '') }
      }
      if (token.text === '{' || token.text === '[') {
        const kind = token.text === '{' ? 'object' : 'array'
        return { frames: [...state.frames, { kind, key: state.key }], key: null }
      }
      if (token.text === '(') {
        const [root, dot, delegate, second, operation] = tokens.slice(index - 5, index)
        const call =
          root !== undefined &&
          NAME.test(root.text) &&
          dot?.text === '.' &&
          delegate !== undefined &&
          NAME.test(delegate.text) &&
          second?.text === '.' &&
          operation !== undefined &&
          NAME.test(operation.text)
        const frame: Frame =
          call && !delegate.text.startsWith('$')
            ? { kind: 'call', delegate: delegate.text, operation: operation.text }
            : { kind: 'paren' }
        return { frames: [...state.frames, frame], key: null }
      }
      if (token.text === '}' || token.text === ']' || token.text === ')') {
        return { frames: state.frames.slice(0, -1), key: null }
      }
      return token.text === ',' ? { ...state, key: null } : state
    },
    { frames: [], key: null },
  )
}

/**
 * What the cursor is completing: a model delegate after `prisma.`, an operation after
 * `prisma.user.`, or a key inside the argument of an operation — with the keys that lead there,
 * so `where: { posts: { some: { |` knows it is naming a field of the related model.
 */
export function contextAt(text: string, cursor: number): CursorContext | null {
  const before = text.slice(0, cursor)
  const tokens = [...before.matchAll(TOKEN)].map((match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }))
  const last = tokens.at(-1)
  const touching = last?.end === cursor ? last : null
  if (touching !== null && isOpen(touching)) return null
  const word = touching !== null && NAME.test(touching.text) ? touching : null
  const from = word?.start ?? cursor
  const settled = (word === null ? tokens : tokens.slice(0, -1)).filter(
    (token) => !token.text.startsWith('//') && !token.text.startsWith('/*'),
  )
  const [root, dot, delegate, second] = settled.slice(-4)
  if (second?.text === '.' && delegate !== undefined && NAME.test(delegate.text)) {
    return dot?.text === '.' && root !== undefined && NAME.test(root.text)
      ? { kind: 'operation', delegate: delegate.text, from }
      : null
  }
  const beforeWord = settled.at(-1)
  if (beforeWord?.text === '.') {
    const owner = settled.at(-2)
    const ownerDot = settled.at(-3)
    return owner !== undefined && NAME.test(owner.text) && ownerDot?.text !== '.'
      ? { kind: 'delegate', from }
      : null
  }
  if (beforeWord?.text !== '{' && beforeWord?.text !== ',') return null
  const { frames } = framesOf(settled)
  if (frames.at(-1)?.kind !== 'object') return null
  const callIndex = frames.findLastIndex((frame) => frame.kind === 'call')
  const call = frames[callIndex]
  if (call?.kind !== 'call') return null
  const inner = frames.slice(callIndex + 1)
  if (inner.some((frame) => frame.kind === 'paren' || frame.kind === 'call')) return null
  const path = inner.flatMap((frame) =>
    (frame.kind === 'object' || frame.kind === 'array') && frame.key !== null ? [frame.key] : [],
  )
  return { kind: 'key', delegate: call.delegate, operation: call.operation, path, from }
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

function filtersOf(field: CompletionField) {
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

function suggestionsOf(shape: Shape): readonly Suggestion[] {
  if (shape.kind === 'none') return []
  if (shape.kind === 'filter') {
    return filtersOf(shape.field).map((label) => argument(label, `${shape.field.type} filter`))
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
  const model = models.find((candidate) => delegateOf(candidate.name) === context.delegate)
  if (model === undefined) return []
  if (context.kind === 'operation') {
    return Object.entries(OPERATIONS).map(([label, operation]) => ({
      label,
      detail: `${operation.write ? 'write' : 'read'} · ${operation.detail}`,
      kind: 'operation',
    }))
  }
  const shape = context.path.reduce<Shape>((current, key) => step(current, key, models), {
    kind: 'args',
    model,
    operation: context.operation,
  })
  return suggestionsOf(shape)
}
