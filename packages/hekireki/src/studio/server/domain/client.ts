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

// The text ends at the last token, or at the first character that cannot start one; that `eof`
// carries what is wrong there, and a parse that gets stuck on it reports that instead.
type Token = {
  readonly kind: 'name' | 'number' | 'string' | 'punct' | 'eof'
  readonly text: string
  readonly problem?: string
} & Range

type Failure = { readonly message: string } & Range

type Parsed<T> =
  | { readonly ok: true; readonly value: T; readonly next: number }
  | { readonly ok: false; readonly failure: Failure }

type Call = {
  readonly delegate: Token
  readonly operation: Token
  readonly args: ClientValue
} & Range

// One alternative per token; whitespace and comments are matched only to be skipped, and the
// last alternative takes any character the others do not, so the text is covered end to end.
const TOKEN =
  /(?<skip>\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(?<comment>\/\*)|(?<number>(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)n?)|(?<string>"(?:[^"\\\n]|\\[\s\S])*"|'(?:[^'\\\n]|\\[\s\S])*'|`(?:[^`\\]|\\[\s\S])*`)|(?<quote>["'`])|(?<name>[A-Za-z_$][\w$]*)|(?<punct>\.\.\.|[{}[\]().,:;-])|(?<other>[\s\S])/gu

function fail(range: Range & { readonly problem?: string }, message: string) {
  return {
    ok: false,
    failure: { message: range.problem ?? message, start: range.start, end: range.end },
  } as const
}

function done<T>(value: T, next: number) {
  return { ok: true, value, next } as const
}

function tokenize(text: string): readonly Token[] {
  const scanned = [...text.matchAll(TOKEN)].flatMap((match): Token[] => {
    const start = match.index
    const end = start + match[0].length
    const groups = match.groups ?? {}
    if (groups.skip !== undefined) return []
    const problem =
      groups.comment === undefined
        ? groups.quote === undefined
          ? groups.other === undefined
            ? null
            : `Unexpected character "${match[0]}"`
          : 'Unterminated string'
        : 'Unterminated comment'
    if (problem !== null) return [{ kind: 'eof', text: match[0], start, end, problem }]
    const kind =
      groups.number === undefined
        ? groups.string === undefined
          ? groups.name === undefined
            ? 'punct'
            : 'name'
          : 'string'
        : 'number'
    return [{ kind, text: match[0], start, end }]
  })
  const stop = scanned.findIndex((token) => token.kind === 'eof')
  return stop === -1 ? scanned : scanned.slice(0, stop + 1)
}

function tokenAt(tokens: readonly Token[], index: number): Token {
  const last = tokens.at(-1)
  if (last?.kind === 'eof') return tokens[Math.min(index, tokens.length - 1)] ?? last
  const end = last?.end ?? 0
  return tokens[index] ?? { kind: 'eof', text: '', start: end, end }
}

function isPunct(token: Token, text: string) {
  return token.kind === 'punct' && token.text === text
}

function isName(token: Token, text: string) {
  return token.kind === 'name' && token.text === text
}

function found(token: Token) {
  return token.kind === 'eof' ? 'the end of the text' : `"${token.text}"`
}

const ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  v: '\v',
  0: '\0',
  '\n': '',
  '\r\n': '',
}

/** The characters of a string literal, its escapes resolved; null for a template with `${}` in it. */
function decodeString(text: string) {
  const body = text.slice(1, -1)
  if (text.startsWith('`') && /(?<!\\)(?:\\\\)*\$\{/u.test(body)) return null
  return body.replaceAll(
    /\\(u\{[\da-fA-F]+\}|u[\da-fA-F]{4}|x[\da-fA-F]{2}|\r\n|[\s\S])/gu,
    (_, escape: string) =>
      escape.startsWith('u') || escape.startsWith('x')
        ? String.fromCodePoint(Number.parseInt(escape.replaceAll(/[ux{}]/gu, ''), 16))
        : (ESCAPES[escape] ?? escape),
  )
}

function decodeNumber(text: string) {
  const digits = text.replaceAll('_', '')
  return digits.endsWith('n') ? BigInt(digits.slice(0, -1)) : Number(digits)
}

const LITERALS: Readonly<Record<string, ClientValue>> = {
  true: true,
  false: false,
  null: null,
  undefined,
}

function notLiteral(token: Token) {
  return fail(
    token,
    `"${token.text}" is not a literal. Arguments are read, not evaluated: write strings, numbers, booleans, null, objects, arrays or new Date(...).`,
  )
}

/** `new Date()`, `new Date("2025-01-01")` or `new Date(1735689600000)`: the one constructor a query may use. */
function parseDate(tokens: readonly Token[], index: number): Parsed<ClientValue> {
  const name = tokenAt(tokens, index)
  if (!isName(name, 'Date')) {
    return fail(name, `Only new Date(...) is supported, not new ${name.text}`)
  }
  const open = tokenAt(tokens, index + 1)
  if (!isPunct(open, '(')) return fail(open, `Expected "(" after "new Date", found ${found(open)}`)
  const argument = tokenAt(tokens, index + 2)
  if (isPunct(argument, ')')) return done(new Date(), index + 3)
  const value =
    argument.kind === 'string'
      ? decodeString(argument.text)
      : argument.kind === 'number'
        ? decodeNumber(argument.text)
        : null
  if (value === null || typeof value === 'bigint') {
    return fail(argument, 'new Date takes one string or number')
  }
  const close = tokenAt(tokens, index + 3)
  if (!isPunct(close, ')')) return fail(close, `Expected ")", found ${found(close)}`)
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? fail({ start: argument.start, end: close.end }, `Invalid date: ${argument.text}`)
    : done(date, index + 4)
}

/**
 * A comma-separated list up to the closing bracket, a trailing comma allowed. A loop, not a
 * recursion over the items: the data of a `createMany` is thousands of rows, and a stack frame
 * per row would overflow.
 */
function parseItems<T>(
  tokens: readonly Token[],
  index: number,
  close: string,
  item: (tokens: readonly Token[], index: number) => Parsed<T>,
): Parsed<readonly T[]> {
  const items: T[] = []
  for (let at = index; ;) {
    if (isPunct(tokenAt(tokens, at), close)) return done(items, at + 1)
    const parsed = item(tokens, at)
    if (!parsed.ok) return parsed
    // oxlint-disable-next-line custom/no-mutation -- the list is built here and returned whole
    items.push(parsed.value)
    const after = tokenAt(tokens, parsed.next)
    if (isPunct(after, close)) return done(items, parsed.next + 1)
    if (!isPunct(after, ',')) {
      return fail(after, `Expected "," or "${close}", found ${found(after)}`)
    }
    at = parsed.next + 1
  }
}

/** How deep the brackets of a query may nest: past it the reading would run out of stack. */
const MAX_DEPTH = 256

/** The first bracket that opens deeper than MAX_DEPTH, if any. */
function tooDeep(tokens: readonly Token[]) {
  for (let index = 0, depth = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token?.kind === 'punct' && ['{', '[', '('].includes(token.text)) {
      depth += 1
      if (depth > MAX_DEPTH) return token
    } else if (token?.kind === 'punct' && ['}', ']', ')'].includes(token.text)) {
      depth -= 1
    }
  }
  return null
}

function parseEntry(
  tokens: readonly Token[],
  index: number,
): Parsed<readonly [string, ClientValue]> {
  const key = tokenAt(tokens, index)
  if (isPunct(key, '...')) return fail(key, 'Spread is not supported: write the fields out')
  if (isPunct(key, '[')) return fail(key, 'Computed keys are not supported')
  const name =
    key.kind === 'name'
      ? key.text
      : key.kind === 'string'
        ? decodeString(key.text)
        : key.kind === 'number'
          ? String(decodeNumber(key.text))
          : null
  if (name === null) return fail(key, `Expected a key, found ${found(key)}`)
  const colon = tokenAt(tokens, index + 1)
  if (!isPunct(colon, ':')) {
    return key.kind === 'name' && (isPunct(colon, ',') || isPunct(colon, '}'))
      ? fail(key, `"${key.text}" is a variable: write "${key.text}: <value>"`)
      : fail(colon, `Expected ":" after "${name}", found ${found(colon)}`)
  }
  const value = parseValue(tokens, index + 2)
  return value.ok ? done([name, value.value] as const, value.next) : value
}

function parseValue(tokens: readonly Token[], index: number): Parsed<ClientValue> {
  const token = tokenAt(tokens, index)
  if (isPunct(token, '{')) {
    const entries = parseItems(tokens, index + 1, '}', parseEntry)
    return entries.ok ? done(Object.fromEntries(entries.value), entries.next) : entries
  }
  if (isPunct(token, '[')) return parseItems(tokens, index + 1, ']', parseValue)
  if (token.kind === 'string') {
    const value = decodeString(token.text)
    return value === null
      ? fail(token, 'Template literals that interpolate are not supported')
      : done(value, index + 1)
  }
  if (token.kind === 'number') return done(decodeNumber(token.text), index + 1)
  if (isPunct(token, '-')) {
    const number = tokenAt(tokens, index + 1)
    if (number.kind !== 'number') return fail(number, `Expected a number after "-"`)
    return done(-decodeNumber(number.text), index + 2)
  }
  if (token.kind === 'name') {
    if (isName(token, 'new')) return parseDate(tokens, index + 1)
    return Object.hasOwn(LITERALS, token.text)
      ? done(LITERALS[token.text], index + 1)
      : notLiteral(token)
  }
  return fail(token, `Expected a value, found ${found(token)}`)
}

/** The one argument of an operation, if any, and the closing parenthesis. */
function parseArguments(tokens: readonly Token[], index: number): Parsed<ClientValue> {
  if (isPunct(tokenAt(tokens, index), ')')) return done(undefined, index + 1)
  const value = parseValue(tokens, index)
  if (!value.ok) return value
  const comma = isPunct(tokenAt(tokens, value.next), ',') ? 1 : 0
  const close = tokenAt(tokens, value.next + comma)
  if (isPunct(close, ')')) return done(value.value, value.next + comma + 1)
  return comma === 1 && close.kind !== 'eof'
    ? fail(close, 'A model operation takes one argument')
    : fail(close, `Expected ")", found ${found(close)}`)
}

/** `prisma.user.findMany({ ... })`: whatever the client is called, a delegate, an operation, one argument. */
function parseCall(tokens: readonly Token[], index: number): Parsed<Call> {
  const root = tokenAt(tokens, index)
  if (root.kind !== 'name') {
    return fail(root, `Expected a call such as prisma.user.findMany(), found ${found(root)}`)
  }
  const dot = tokenAt(tokens, index + 1)
  if (!isPunct(dot, '.')) return fail(dot, `Expected "." after "${root.text}", found ${found(dot)}`)
  const delegate = tokenAt(tokens, index + 2)
  if (delegate.kind !== 'name') {
    return fail(delegate, `Expected a model delegate such as "user", found ${found(delegate)}`)
  }
  if (delegate.text.startsWith('$')) {
    return fail(
      delegate,
      delegate.text === '$transaction'
        ? '$transaction cannot be nested'
        : `${delegate.text} is not supported here: run raw SQL on the SQL page`,
    )
  }
  const second = tokenAt(tokens, index + 3)
  if (!isPunct(second, '.')) {
    return fail(second, `Expected "." and an operation after "${delegate.text}"`)
  }
  const operation = tokenAt(tokens, index + 4)
  if (operation.kind !== 'name') {
    return fail(operation, `Expected an operation such as "findMany", found ${found(operation)}`)
  }
  const open = tokenAt(tokens, index + 5)
  if (!isPunct(open, '(')) {
    return fail(open, `Expected "(" after "${operation.text}", found ${found(open)}`)
  }
  const args = parseArguments(tokens, index + 6)
  if (!args.ok) return args
  const end = tokenAt(tokens, args.next - 1).end
  return done({ delegate, operation, args: args.value, start: root.start, end }, args.next)
}

/** `prisma.$transaction([call, ...], options?)`, from the token after `$transaction`. */
function parseTransaction(
  tokens: readonly Token[],
  index: number,
): Parsed<{ readonly calls: readonly Call[]; readonly options: ClientValue }> {
  const open = tokenAt(tokens, index)
  if (!isPunct(open, '(')) {
    return fail(open, `Expected "(" after "$transaction", found ${found(open)}`)
  }
  const bracket = tokenAt(tokens, index + 1)
  if (!isPunct(bracket, '[')) {
    return fail(
      bracket,
      '$transaction takes an array of calls here: prisma.$transaction([prisma.user.count(), ...])',
    )
  }
  const calls = parseItems(tokens, index + 2, ']', parseCall)
  if (!calls.ok) return calls
  if (calls.value.length === 0) return fail(bracket, '$transaction needs at least one call')
  const hasOptions = isPunct(tokenAt(tokens, calls.next), ',')
  const options = hasOptions ? parseArguments(tokens, calls.next + 1) : null
  if (options === null) {
    const close = tokenAt(tokens, calls.next)
    return isPunct(close, ')')
      ? done({ calls: calls.value, options: undefined }, calls.next + 1)
      : fail(close, `Expected ")", found ${found(close)}`)
  }
  return options.ok ? done({ calls: calls.value, options: options.value }, options.next) : options
}

function parseSingle(
  tokens: readonly Token[],
  index: number,
): Parsed<{ readonly calls: readonly Call[]; readonly options: ClientValue }> {
  const call = parseCall(tokens, index)
  return call.ok ? done({ calls: [call.value], options: undefined }, call.next) : call
}

function parseProgram(tokens: readonly Token[]): Parsed<{
  readonly calls: readonly Call[]
  readonly transaction: boolean
  readonly options: ClientValue
}> {
  const first = isName(tokenAt(tokens, 0), 'await') ? 1 : 0
  const transaction =
    isPunct(tokenAt(tokens, first + 1), '.') && isName(tokenAt(tokens, first + 2), '$transaction')
  const parsed = transaction ? parseTransaction(tokens, first + 3) : parseSingle(tokens, first)
  if (!parsed.ok) return parsed
  const end = isPunct(tokenAt(tokens, parsed.next), ';') ? parsed.next + 1 : parsed.next
  const rest = tokenAt(tokens, end)
  if (rest.problem !== undefined) return fail(rest, rest.problem)
  if (rest.kind !== 'eof') {
    return fail(
      { start: rest.start, end: tokenAt(tokens, tokens.length - 1).end },
      'Only one call runs at a time: batch several in prisma.$transaction([...])',
    )
  }
  return done({ ...parsed.value, transaction }, end)
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
  const tokens = tokenize(input.text)
  const deep = tooDeep(tokens)
  const parsed =
    deep === null
      ? parseProgram(tokens)
      : fail(deep, `The arguments nest deeper than ${MAX_DEPTH} levels`)
  if (!parsed.ok) {
    const { message, start, end } = parsed.failure
    return {
      calls: [],
      transaction: false,
      options: undefined,
      diagnostics: [{ message, range: { start, end } }],
    }
  }
  const known = input.models.map((model) => ({ model, delegate: delegateOf(model) }))
  const resolved = parsed.value.calls.map((call) => {
    const model = known.find((entry) => entry.delegate === call.delegate.text)?.model ?? null
    const operation = OPERATIONS.includes(call.operation.text) ? call.operation.text : null
    const diagnostics = [
      ...(model === null
        ? [
            {
              message:
                known.length === 0
                  ? `Unknown model delegate "${call.delegate.text}": the schema has no models`
                  : `Unknown model delegate "${call.delegate.text}". The client has ${known.map((entry) => entry.delegate).join(', ')}`,
              range: { start: call.delegate.start, end: call.delegate.end },
            },
          ]
        : []),
      ...(operation === null
        ? [
            {
              message: `"${call.operation.text}" is not a model operation. Use ${OPERATIONS.join(', ')}`,
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
              delegate: call.delegate.text,
              operation,
              write: isWriteOperation({ operation }),
              args: call.args,
              range: { start: call.start, end: call.end },
            },
          ],
    ),
    transaction: parsed.value.transaction,
    options: parsed.value.options,
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

type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

function isFunction(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === 'function'
}

function jsonOf(value: unknown): JsonValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64')
  if (Array.isArray(value)) return value.map((item: unknown) => jsonOf(item))
  if (typeof value !== 'object') return null
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype === Object.prototype || prototype === null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonOf(item)]))
  }
  // A Decimal (and anything else with a JSON form of its own) says how it wants to be written.
  const toJson: unknown = Reflect.get(value, 'toJSON')
  const written: unknown = isFunction(toJson) ? Reflect.apply(toJson, value, []) : null
  return typeof written === 'object' ? null : jsonOf(written)
}

const MakeClientResultInput = z
  .object({
    value: z.unknown().meta({ description: 'What the Prisma Client call resolved to.' }),
    limit: z
      .number()
      .int()
      .min(1)
      .meta({ description: 'The most rows of an array result to keep.', example: 500 }),
  })
  .readonly()
  .meta({ description: 'A Prisma Client result to send as JSON' })

/**
 * The result as JSON (dates as ISO strings, bigints and decimals as strings, bytes as base64),
 * an array cut to its first rows, with the length it had.
 *
 * @param input - the value and how many rows of an array to keep
 * @returns the JSON value, the array length (null for anything else) and whether it was cut
 */
export function makeClientResult(input: z.infer<typeof MakeClientResultInput>) {
  const { value, limit } = input
  if (!Array.isArray(value)) return { result: jsonOf(value), rowCount: null, truncated: false }
  return {
    result: value.slice(0, limit).map((item: unknown) => jsonOf(item)),
    rowCount: value.length,
    truncated: value.length > limit,
  }
}

const MakeSqlParamsInput = z
  .object({
    text: z.string().meta({
      description: 'The params of a Prisma query event, as JSON text.',
      example: '["ann",10,0]',
    }),
  })
  .readonly()
  .meta({ description: 'The params Prisma logged for a statement', example: { text: '[1]' } })

/** The logged params as JSON cells; a value that is not a cell is its JSON text, text that is not JSON is dropped. */
export function makeSqlParams(input: z.infer<typeof MakeSqlParamsInput>) {
  const parsed = ((): unknown => {
    try {
      return JSON.parse(input.text)
    } catch {
      return []
    }
  })()
  return (Array.isArray(parsed) ? parsed : []).map((item: unknown) =>
    item === null ||
    typeof item === 'string' ||
    typeof item === 'number' ||
    typeof item === 'boolean'
      ? item
      : JSON.stringify(item),
  )
}
