/** The model operations of Prisma Client, each with what it does and the arguments it takes. */
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
