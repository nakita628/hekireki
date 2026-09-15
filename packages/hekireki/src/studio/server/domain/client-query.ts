import { parse } from 'acorn'
import type { Expression, PrivateIdentifier, SpreadElement } from 'acorn'
import * as z from 'zod'

/** The model operations that only read, in the order the Prisma docs list them. */
const READ_OPERATIONS = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
] as const

/** The model operations that write. */
const WRITE_OPERATIONS = [
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
] as const

const OPERATIONS: readonly string[] = [...READ_OPERATIONS, ...WRITE_OPERATIONS]

/** An argument as the query text spells it: JSON, plus `undefined`, bigints and dates. */
export type ClientValue =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | Date
  | readonly ClientValue[]
  | { readonly [key: string]: ClientValue }

type Range = { readonly start: number; readonly end: number }

type Read<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: { readonly message: string } & Range }

/** How deep the arguments of a query may nest: past it the reading would run out of stack. */
const MAX_DEPTH = 256

function fail(node: Range, message: string) {
  return { ok: false as const, failure: { message, start: node.start, end: node.end } }
}

function done<T>(value: T) {
  return { ok: true as const, value }
}

/** The name a member is written with: `x.name`, never `x[name]`. */
function nameOf(node: Expression | PrivateIdentifier) {
  return node.type === 'Identifier' ? node.name : null
}

/** A literal read as the value it spells; anything that would need evaluating is refused. */
function valueOf(node: Expression | SpreadElement, depth: number): Read<ClientValue> {
  if (depth > MAX_DEPTH) return fail(node, `The arguments nest deeper than ${MAX_DEPTH} levels`)
  if (node.type === 'Literal') {
    if (node.bigint !== undefined) return done(BigInt(node.bigint))
    const { value } = node
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? done(value)
      : value === null
        ? done(null)
        : fail(node, 'A regular expression is not a value')
  }
  if (node.type === 'TemplateLiteral') {
    const cooked = node.quasis[0]?.value.cooked
    return node.expressions.length > 0 || cooked === null || cooked === undefined
      ? fail(node, 'Template literals that interpolate are not supported')
      : done(cooked)
  }
  if (node.type === 'Identifier') {
    return node.name === 'undefined'
      ? done(undefined)
      : fail(
          node,
          `"${node.name}" is not a literal. Arguments are read, not evaluated: write strings, numbers, booleans, null, objects, arrays or new Date(...).`,
        )
  }
  if (node.type === 'UnaryExpression') {
    const inner = node.argument
    if (node.operator === '-' && inner.type === 'Literal') {
      return inner.bigint === undefined
        ? typeof inner.value === 'number'
          ? done(-inner.value)
          : fail(inner, 'Expected a number after "-"')
        : done(-BigInt(inner.bigint))
    }
    return fail(node, `"${node.operator}" is not supported: write the value out`)
  }
  if (node.type === 'ArrayExpression') {
    return node.elements.reduce<Read<readonly ClientValue[]>>((items, element) => {
      if (!items.ok) return items
      if (element === null) return fail(node, 'An array cannot have a hole')
      if (element.type === 'SpreadElement') {
        return fail(element, 'Spread is not supported: write the items out')
      }
      const item = valueOf(element, depth + 1)
      return item.ok ? done([...items.value, item.value]) : item
    }, done([]))
  }
  if (node.type === 'ObjectExpression') {
    return node.properties.reduce<Read<Readonly<Record<string, ClientValue>>>>(
      (entries, property) => {
        if (!entries.ok) return entries
        if (property.type === 'SpreadElement') {
          return fail(property, 'Spread is not supported: write the fields out')
        }
        if (property.computed) return fail(property.key, 'Computed keys are not supported')
        if (property.shorthand) {
          return fail(
            property.key,
            `"${nameOf(property.key) ?? ''}" is a variable: write "${nameOf(property.key) ?? ''}: <value>"`,
          )
        }
        if (property.kind !== 'init' || property.method) {
          return fail(property, 'A method is not a value')
        }
        const key =
          property.key.type === 'Literal' ? String(property.key.value) : nameOf(property.key)
        if (key === null) return fail(property.key, 'Expected a key')
        const value = valueOf(property.value, depth + 1)
        return value.ok ? done({ ...entries.value, [key]: value.value }) : value
      },
      done({}),
    )
  }
  if (node.type === 'NewExpression') {
    if (nameOf(node.callee) !== 'Date') {
      return fail(
        node,
        `Only new Date(...) is supported, not new ${node.callee.type === 'Identifier' ? node.callee.name : '…'}`,
      )
    }
    const [argument, second] = node.arguments
    if (argument === undefined) return done(new Date())
    if (second !== undefined) return fail(second, 'new Date takes one string or number')
    if (
      argument.type !== 'Literal' ||
      argument.bigint !== undefined ||
      (typeof argument.value !== 'string' && typeof argument.value !== 'number')
    ) {
      return fail(argument, 'new Date takes one string or number')
    }
    const date = new Date(argument.value)
    return Number.isNaN(date.getTime())
      ? fail(node, `Invalid date: ${argument.raw ?? ''}`)
      : done(date)
  }
  return fail(
    node,
    'Only literals are read: strings, numbers, booleans, null, objects, arrays and new Date(...).',
  )
}

/** `prisma.user.findMany({ ... })`: whatever the client is called, a delegate, an operation, one argument. */
function callOf(node: Expression) {
  if (node.type === 'TaggedTemplateExpression' && node.tag.type === 'MemberExpression') {
    const tag = nameOf(node.tag.property)
    if (tag?.startsWith('$')) {
      return fail(node.tag.property, `${tag} is not supported here: run raw SQL on the SQL page`)
    }
  }
  if (node.type !== 'CallExpression') {
    return fail(node, 'Expected a call such as prisma.user.findMany()')
  }
  const { callee } = node
  if (callee.type !== 'MemberExpression') {
    return fail(callee, 'Expected a call such as prisma.user.findMany()')
  }
  // `prisma.$transaction(...)` inside a batch, `prisma.$queryRaw(...)`: the client's own methods.
  const own = nameOf(callee.property)
  if (own?.startsWith('$')) {
    return fail(
      callee.property,
      own === '$transaction'
        ? '$transaction cannot be nested'
        : `${own} is not supported here: run raw SQL on the SQL page`,
    )
  }
  if (callee.object.type !== 'MemberExpression') {
    return fail(callee, 'Expected a call such as prisma.user.findMany()')
  }
  const delegate = nameOf(callee.object.property)
  const operation = nameOf(callee.property)
  if (delegate === null || callee.object.computed) {
    return fail(callee.object.property, 'Expected a model delegate such as "user"')
  }
  if (delegate.startsWith('$')) {
    return fail(
      callee.object.property,
      delegate === '$transaction'
        ? '$transaction cannot be nested'
        : `${delegate} is not supported here: run raw SQL on the SQL page`,
    )
  }
  if (operation === null || callee.computed) {
    return fail(callee.property, 'Expected an operation such as "findMany"')
  }
  const [argument, second] = node.arguments
  if (second !== undefined) return fail(second, 'A model operation takes one argument')
  const args = argument === undefined ? done(undefined) : valueOf(argument, 1)
  if (!args.ok) return args
  return done({
    delegate: { name: delegate, ...callee.object.property },
    operation: { name: operation, ...callee.property },
    args: args.value,
    start: node.start,
    end: node.end,
  })
}

/** The one statement of the text: a call, or a batch `$transaction` over several. */
function programOf(text: string) {
  try {
    const result = parse(text, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowAwaitOutsideFunction: true,
    })
    const [statement, next] = result.body
    if (statement === undefined) {
      return fail({ start: 0, end: text.length }, 'Expected a call such as prisma.user.findMany()')
    }
    if (next !== undefined) {
      return fail(
        { start: next.start, end: text.length },
        'Only one call runs at a time: batch several in prisma.$transaction([...])',
      )
    }
    if (statement.type !== 'ExpressionStatement') {
      return fail(statement, 'Expected a call such as prisma.user.findMany()')
    }
    const expression =
      statement.expression.type === 'AwaitExpression'
        ? statement.expression.argument
        : statement.expression
    const transaction =
      expression.type === 'CallExpression' &&
      expression.callee.type === 'MemberExpression' &&
      nameOf(expression.callee.property) === '$transaction'
    if (!transaction) {
      const call = callOf(expression)
      return call.ok ? done({ calls: [call.value], transaction: false, options: undefined }) : call
    }
    const [batch, options, extra] = expression.arguments
    if (batch?.type !== 'ArrayExpression') {
      return fail(
        batch ?? expression,
        '$transaction takes an array of calls here: prisma.$transaction([prisma.user.count(), ...])',
      )
    }
    if (batch.elements.length === 0) return fail(batch, '$transaction needs at least one call')
    if (extra !== undefined) {
      return fail(extra, '$transaction takes the calls and, at most, options')
    }
    const calls = batch.elements.map((element) =>
      element === null || element.type === 'SpreadElement'
        ? fail(element ?? batch, 'Expected a call such as prisma.user.count()')
        : callOf(element),
    )
    const refused = calls.find((call) => !call.ok)
    if (refused !== undefined && !refused.ok) return refused
    const read = options === undefined ? done(undefined) : valueOf(options, 1)
    return read.ok
      ? done({
          calls: calls.flatMap((call) => (call.ok ? [call.value] : [])),
          transaction: true,
          options: read.value,
        })
      : read
  } catch (e) {
    // acorn says where it stopped; its "(line:column)" suffix is what the range is for.
    const at =
      e instanceof SyntaxError && 'pos' in e && typeof e.pos === 'number' ? e.pos : text.length
    return fail(
      { start: Math.min(at, text.length), end: Math.min(at + 1, text.length) },
      e instanceof Error ? e.message.replace(/ \(\d+:\d+\)$/u, '') : 'The text could not be read',
    )
  }
}

/** `User` → `user`, `OrderItem` → `orderItem`: the property Prisma Client exposes a model under. */
function delegateOf(model: string) {
  return `${model.charAt(0).toLowerCase()}${model.slice(1)}`
}

const MakeClientQueryInput = z
  .object({
    text: z.string().meta({
      description: 'The query as it was typed.',
      example: 'prisma.user.findMany({ take: 10 })',
    }),
    models: z
      .array(z.string().meta({ description: 'A model name.', example: 'User' }))
      .readonly()
      .meta({ description: 'The model names of the schema, as declared.' }),
  })
  .readonly()
  .meta({
    description: 'Query text to read against the models of the schema',
    example: { text: 'prisma.user.findMany()', models: ['User'] },
  })

/**
 * Reads the query text without evaluating any of it: the calls it makes, each resolved to a
 * model of the schema and an operation Prisma Client has, their literal arguments, and what keeps
 * it from being run (a problem of the text stops the reading; unknown names are all reported).
 *
 * @param input - the text and the model names
 * @returns the calls, whether they form a `$transaction`, its options, and the diagnostics
 */
export function makeClientQuery(input: z.infer<typeof MakeClientQueryInput>) {
  const result = programOf(input.text)
  if (!result.ok) {
    const { message, start, end } = result.failure
    return {
      calls: [],
      transaction: false,
      options: undefined,
      diagnostics: [{ message, range: { start, end } }],
    }
  }
  const known = input.models.map((model) => ({ model, delegate: delegateOf(model) }))
  const resolved = result.value.calls.map((call) => {
    const model = known.find((entry) => entry.delegate === call.delegate.name)?.model ?? null
    const operation = OPERATIONS.includes(call.operation.name) ? call.operation.name : null
    const diagnostics = [
      ...(model === null
        ? [
            {
              message:
                known.length === 0
                  ? `Unknown model delegate "${call.delegate.name}": the schema has no models`
                  : `Unknown model delegate "${call.delegate.name}". The client has ${known.map((entry) => entry.delegate).join(', ')}`,
              range: { start: call.delegate.start, end: call.delegate.end },
            },
          ]
        : []),
      ...(operation === null
        ? [
            {
              message: `"${call.operation.name}" is not a model operation. Use ${OPERATIONS.join(', ')}`,
              range: { start: call.operation.start, end: call.operation.end },
            },
          ]
        : []),
    ]
    return { call, model, operation, diagnostics }
  })
  return {
    calls: resolved.flatMap(({ call, model, operation }) =>
      model === null || operation === null
        ? []
        : [
            {
              model,
              delegate: call.delegate.name,
              operation,
              write: isWriteOperation({ operation }),
              args: call.args,
              range: { start: call.start, end: call.end },
            },
          ],
    ),
    transaction: result.value.transaction,
    options: result.value.options,
    diagnostics: resolved.flatMap((entry) => entry.diagnostics),
  }
}

const IsWriteOperationInput = z
  .object({
    operation: z.string().meta({ description: 'A model operation name.', example: 'create' }),
  })
  .readonly()
  .meta({ description: 'A model operation to classify', example: { operation: 'create' } })

/** Whether the model operation writes: create, update, upsert and delete in all their forms. */
export function isWriteOperation(input: z.infer<typeof IsWriteOperationInput>) {
  return WRITE_OPERATIONS.some((operation) => operation === input.operation)
}
