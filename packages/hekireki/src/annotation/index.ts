export function parseRelation(line: string) {
  const match = line.trim().match(/^@relation\s+(\w+)\.(\w+)\s+(\w+)\.(\w+)\s+(\w+-to-\w+)$/u)
  if (!match) return null
  const [, fromModel = '', fromField = '', toModel = '', toField = '', type = ''] = match
  return { fromModel, fromField, toModel, toField, type }
}

export function makeValidationExtractor(annotationPrefix: `@${string}.`) {
  const escaped = annotationPrefix.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const regex = new RegExp(`${escaped}(.+?)(?:\\n|$)`, 'u')
  return function extractValidation(documentation: string | undefined) {
    if (documentation === undefined || documentation === '') return null
    const match = documentation.match(regex)
    return match?.[1]?.trim() ?? null
  }
}

const ANNOTATION_PREFIXES = [
  '@z.',
  '@v.',
  '@a.',
  '@e.',
  '@t.',
  '@j.',
  '@p.',
  '@ar.',
  '@ecto.',
  '@api.',
  '@relation',
] as const
const ANNOTATION_EXACT = new Set(['@z', '@v', '@a', '@e', '@t', '@j', '@p', '@ar', '@ecto'])

export function isAnnotationLine(line: string) {
  const trimmed = line.trim()
  return ANNOTATION_PREFIXES.some((p) => trimmed.startsWith(p)) || ANNOTATION_EXACT.has(trimmed)
}

export function stripAnnotations(doc: string | undefined) {
  const result = documentationLines(doc).join('\n').trim()
  return result.length > 0 ? result : undefined
}

/**
 * The prose of a `///` comment as a JSDoc comment (also KDoc and PHPDoc) at `indent`: no lines
 * when there is none, one line `/** … *\/` for one line of prose, and a block for more. A `*\/` in
 * the text cannot close the comment early.
 *
 * @param text - the prose, as {@link stripAnnotations} returns it
 * @param indent - the indentation of the commented line
 * @returns the lines of the block
 */
export function docBlockLines(text: string | undefined, indent: string) {
  if (text === undefined) return []
  const lines = text.replaceAll('*/', '*\\/').split('\n')
  if (lines.length === 1) return [`${indent}/** ${lines[0]} */`]
  const body = lines.map((line) => (line === '' ? `${indent} *` : `${indent} * ${line}`))
  return [`${indent}/**`, ...body, `${indent} */`]
}

/** The lines of a doc comment that are prose: annotation lines are dropped. */
function documentationLines(doc: string | undefined) {
  return (doc ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !isAnnotationLine(line))
}

export function extractObjectType(
  documentation: string | undefined,
  prefix: `@${string}.`,
): 'strict' | 'loose' | undefined {
  if (documentation === undefined || documentation === '') return undefined
  const prefixWithoutAt = prefix.slice(1)
  const match = documentation
    .split('\n')
    .map((l) => l.trim())
    .find(
      (line) =>
        line.includes(`${prefixWithoutAt}strictObject`) ||
        line.includes(`${prefixWithoutAt}looseObject`),
    )
  if (match === undefined) return undefined
  if (match.includes('strictObject')) return 'strict'
  return 'loose'
}
