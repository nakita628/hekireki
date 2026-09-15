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
