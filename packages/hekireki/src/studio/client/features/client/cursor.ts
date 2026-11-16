// Where the cursor stands in a Prisma Client call, read by pattern from the text before it:
// enough to know what completion should offer there, and nothing that needs the types.

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

type FrameState = { readonly frames: readonly Frame[]; readonly key: string | null }

const CLOSERS = new Set(['}', ']', ')'])

/** The frame a `(` opens: the argument list of `root.delegate.operation(`, or a plain paren. */
function parenFrame(tokens: readonly Token[], index: number): Frame {
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
  return call && !delegate.text.startsWith('$')
    ? { kind: 'call', delegate: delegate.text, operation: operation.text }
    : { kind: 'paren' }
}

/** The open frames and pending key after one more token. */
function advance(
  state: FrameState,
  token: Token,
  index: number,
  tokens: readonly Token[],
): FrameState {
  const previous = tokens[index - 1]?.text ?? ''
  if (token.text === ':' && (NAME.test(previous) || /^["']/u.test(previous))) {
    return { ...state, key: previous.replaceAll(/^["']|["']$/gu, '') }
  }
  if (token.text === '{' || token.text === '[') {
    const kind = token.text === '{' ? 'object' : 'array'
    return { frames: [...state.frames, { kind, key: state.key }], key: null }
  }
  if (token.text === '(') return { frames: [...state.frames, parenFrame(tokens, index)], key: null }
  if (CLOSERS.has(token.text)) return { frames: state.frames.slice(0, -1), key: null }
  return token.text === ',' ? { ...state, key: null } : state
}

/** The frames open at the end of the tokens, innermost last, and the key a value would belong to. */
function framesOf(tokens: readonly Token[]) {
  return tokens.reduce<FrameState>(advance, { frames: [], key: null })
}

function isCode(token: Token) {
  return !token.text.startsWith('//') && !token.text.startsWith('/*')
}

/** Whether the tokens end in `name.`, where an operation of a delegate is named. */
function endsAfterDelegate(settled: readonly Token[]) {
  const [delegate, second] = settled.slice(-4).slice(2)
  return second?.text === '.' && delegate !== undefined && NAME.test(delegate.text)
}

function operationContext(settled: readonly Token[], from: number): CursorContext | null {
  const [root, dot, delegate] = settled.slice(-4)
  return dot?.text === '.' && root !== undefined && NAME.test(root.text) && delegate !== undefined
    ? { kind: 'operation', delegate: delegate.text, from }
    : null
}

function delegateContext(settled: readonly Token[], from: number): CursorContext | null {
  const owner = settled.at(-2)
  const ownerDot = settled.at(-3)
  return owner !== undefined && NAME.test(owner.text) && ownerDot?.text !== '.'
    ? { kind: 'delegate', from }
    : null
}

/** A key inside the argument object of an operation, with the keys that lead to it. */
function keyContext(settled: readonly Token[], from: number): CursorContext | null {
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

/** The context after the settled tokens, the word being typed left out. */
function contextAfter(settled: readonly Token[], from: number): CursorContext | null {
  if (endsAfterDelegate(settled)) return operationContext(settled, from)
  const beforeWord = settled.at(-1)?.text
  if (beforeWord === '.') return delegateContext(settled, from)
  if (beforeWord !== '{' && beforeWord !== ',') return null
  return keyContext(settled, from)
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
  const settled = (word === null ? tokens : tokens.slice(0, -1)).filter(isCode)
  return contextAfter(settled, from)
}
