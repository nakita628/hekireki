/**
 * SQL laid out for reading: a clause per line, the items of a SELECT list (and of SET, VALUES
 * and RETURNING) one per line under it, AND / OR of a condition at the start of their own
 * lines, and a subquery indented inside its parentheses. Only whitespace changes: every token
 * is written as it came, so the text is the statement that was sent with its lines broken.
 */
import { tokenize } from './tokenize.js'
import type { Token } from './tokenize.js'

const INDENT = '  '

/** The clauses that open a line, longest first so `LEFT OUTER JOIN` wins over `LEFT JOIN`. */
const CLAUSES: readonly (readonly string[])[] = [
  ['LEFT', 'OUTER', 'JOIN'],
  ['RIGHT', 'OUTER', 'JOIN'],
  ['FULL', 'OUTER', 'JOIN'],
  ['GROUP', 'BY'],
  ['ORDER', 'BY'],
  ['UNION', 'ALL'],
  ['LEFT', 'JOIN'],
  ['RIGHT', 'JOIN'],
  ['FULL', 'JOIN'],
  ['INNER', 'JOIN'],
  ['CROSS', 'JOIN'],
  ['ON', 'CONFLICT'],
  ['ON', 'DUPLICATE'],
  ['WITH'],
  ['SELECT'],
  ['FROM'],
  ['WHERE'],
  ['HAVING'],
  ['WINDOW'],
  ['LIMIT'],
  ['OFFSET'],
  ['FETCH'],
  ['UNION'],
  ['INTERSECT'],
  ['EXCEPT'],
  ['INSERT'],
  ['VALUES'],
  ['UPDATE'],
  ['SET'],
  ['DELETE'],
  ['RETURNING'],
  ['JOIN'],
]

/** The clauses whose items go one per line. */
const LISTS = new Set(['SELECT', 'SET', 'VALUES', 'RETURNING'])

/** The clauses whose AND / OR open a line. */
const CONDITIONS = new Set(['WHERE', 'HAVING', 'JOIN', 'ON'])

// A clause word in the middle of another construct: `DELETE FROM`, `IS DISTINCT FROM`,
// `ON CONFLICT DO UPDATE`, `ON DUPLICATE KEY UPDATE`, and MySQL's `VALUES(column)` function.
const NOT_AFTER: Readonly<Record<string, readonly string[]>> = {
  FROM: ['DELETE', 'DISTINCT'],
  UPDATE: ['DO', 'KEY'],
  VALUES: ['=', ',', '('],
}

type State = {
  readonly out: string
  /** The parentheses open, each marked with whether it holds a subquery. */
  readonly parens: readonly boolean[]
  /** The clause each subquery level is in, the statement itself first. */
  readonly clauses: readonly string[]
  /** A line break owed before the next token, at this indent. */
  readonly pending: number | null
  /** The words of a multi-word clause still to be written on its line. */
  readonly rest: number
  /** The depth of parentheses a BETWEEN whose AND is still to come was written at. */
  readonly between: number | null
}

function indent(level: number) {
  return `\n${INDENT.repeat(level)}`
}

function clauseAt(tokens: readonly Token[], index: number) {
  const previous = tokens[index - 1]?.text ?? ''
  return (
    CLAUSES.find(
      (words) =>
        words.every((word, offset) => {
          const token = tokens[index + offset]
          return token?.kind === 'word' && token.text === word
        }) && !(NOT_AFTER[words[0] ?? '']?.includes(previous) ?? false),
    ) ?? null
  )
}

/** How deep in subqueries the statement stands: the indent of its clauses. */
function levelOf(state: State) {
  return state.clauses.length - 1
}

function step(state: State, token: Token, index: number, tokens: readonly Token[], text: string) {
  const previous = tokens[index - 1]
  const gap = previous === undefined ? '' : text.slice(previous.end, token.start)
  // A comment between the tokens stays where it was; otherwise any whitespace is one space.
  const spacing = gap.trim() === '' ? (gap === '' ? '' : ' ') : gap
  // Before a line break, the comment is kept at the end of the line it was on.
  const comment = gap.trim() === '' ? '' : ` ${gap.trim()}`
  const level = levelOf(state)
  const clause = state.clauses.at(-1) ?? ''
  const atClauseLevel = state.parens.length === 0 || state.parens.at(-1) === true
  const joined = (value: string) => ({
    ...state,
    out: `${state.out}${state.pending === null ? spacing : `${comment}${indent(state.pending)}`}${value}`,
    pending: null,
  })
  if (state.rest > 0) {
    return { ...state, out: `${state.out} ${token.raw}`, rest: state.rest - 1 }
  }
  const words = atClauseLevel && token.kind === 'word' ? clauseAt(tokens, index) : null
  if (words !== null) {
    const name = words.at(-1) === 'JOIN' ? 'JOIN' : words.join(' ')
    return {
      ...state,
      out: `${state.out}${state.out === '' ? '' : `${comment}${indent(level)}`}${token.raw}`,
      clauses: [...state.clauses.slice(0, -1), name],
      pending: LISTS.has(name) ? level + 1 : null,
      rest: words.length - 1,
      between: null,
    }
  }
  // `SELECT DISTINCT` keeps the DISTINCT on the SELECT line, the list still under it.
  if (
    clause === 'SELECT' &&
    state.pending !== null &&
    previous?.text === 'SELECT' &&
    (token.text === 'DISTINCT' || token.text === 'ALL')
  ) {
    return { ...state, out: `${state.out} ${token.raw}` }
  }
  if (token.raw === '(') {
    const subquery = tokens[index + 1]?.text === 'SELECT' || tokens[index + 1]?.text === 'WITH'
    const opened = joined('(')
    return {
      ...opened,
      parens: [...state.parens, subquery],
      clauses: subquery ? [...state.clauses, ''] : state.clauses,
    }
  }
  if (token.raw === ')') {
    const subquery = state.parens.at(-1) === true
    const closed = subquery
      ? { ...state, out: `${state.out}${comment}${indent(level - 1)})`, pending: null }
      : joined(')')
    return {
      ...closed,
      parens: state.parens.slice(0, -1),
      clauses: subquery ? state.clauses.slice(0, -1) : state.clauses,
    }
  }
  if (token.raw === ',' && atClauseLevel && LISTS.has(clause)) {
    return { ...joined(','), pending: level + 1 }
  }
  if (token.kind === 'word' && token.text === 'BETWEEN') {
    return { ...joined(token.raw), between: state.parens.length }
  }
  if (token.kind === 'word' && token.text === 'AND' && state.between === state.parens.length) {
    return { ...joined(token.raw), between: null }
  }
  if (
    token.kind === 'word' &&
    (token.text === 'AND' || token.text === 'OR') &&
    atClauseLevel &&
    CONDITIONS.has(clause)
  ) {
    return {
      ...state,
      out: `${state.out}${comment}${indent(level + 1)}${token.raw}`,
      pending: null,
    }
  }
  if (token.raw === ';' && state.parens.length === 0) return { ...joined(';'), pending: 0 }
  return joined(token.raw)
}

/**
 * The statement laid out a clause per line; text the tokenizer cannot read is returned as it is.
 *
 * @param text - one or more SQL statements
 * @returns the same tokens, with the whitespace between them rewritten
 */
export function formatSql(text: string) {
  const result = tokenize(text)
  if (!result.ok) return text
  const tokens = result.tokens.filter((token) => token.kind !== 'eof')
  const formatted = tokens.reduce<State>(
    (state, token, index) => step(state, token, index, tokens, text),
    { out: '', parens: [], clauses: [''], pending: null, rest: 0, between: null },
  )
  return formatted.out
}
