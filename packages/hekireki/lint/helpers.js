// What the rule modules (custom.js, layers.js, failures.js, docs.js) share: how to read the file
// under lint, where a node sits, and which layer of the Studio server a file belongs to.

/** Test files, which build fixtures freely and are exempt from most rules. */
export const TEST_FILE = /\.test\.tsx?$/u

/** A barrel module that only re-exports. */
export const INDEX_FILE = /(^|[\\/])index\.tsx?$/u

const SERVER_LAYER =
  /(^|[\\/])studio[\\/]server[\\/](handlers|usecases|services|domain|errors)[\\/]/u

/**
 * The linted file's path, on the current and the older rule-context API alike.
 *
 * @param context - the rule context
 * @returns the path, or an empty string when the context has none
 */
export function filenameOf(context) {
  return context.filename ?? context.getFilename?.() ?? ''
}

/**
 * The whole source text of the linted file.
 *
 * @param context - the rule context
 * @returns the text
 */
export function sourceTextOf(context) {
  return context.sourceCode?.text ?? context.getSourceCode?.().text ?? ''
}

/**
 * A node's offsets in the source.
 *
 * @param node - an AST node
 * @returns `[start, end]`
 */
export function rangeOf(node) {
  return node.range ?? [node.start, node.end]
}

/**
 * Whether node `inner` lies inside node `outer`.
 *
 * @param inner - the node that may be inside
 * @param outer - the node that may contain it
 * @returns true when `inner`'s range is within `outer`'s
 */
export function isWithin(inner, outer) {
  const [innerStart, innerEnd] = rangeOf(inner)
  const [outerStart, outerEnd] = rangeOf(outer)
  return innerStart >= outerStart && innerEnd <= outerEnd
}

/**
 * The `xxx` of an `Effect.xxx` member expression.
 *
 * @param node - a callee or a member expression
 * @returns the member name, or null for anything that is not `Effect.<name>`
 */
export function effectMember(node) {
  return node?.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    node.object.name === 'Effect' &&
    node.property.type === 'Identifier'
    ? node.property.name
    : null
}

/**
 * The Studio server layer a file belongs to.
 *
 * @param filename - path of the file under lint (either `/` or `\` separators)
 * @returns handlers, usecases, services, domain or errors; null outside them
 */
export function layerOf(filename) {
  return SERVER_LAYER.exec(filename)?.[2] ?? null
}

/**
 * Resolve a relative import specifier against the importing file.
 *
 * @param filename - path of the importing file
 * @param specifier - the module specifier
 * @returns the joined path with `/` separators, or null for a bare specifier
 */
export function resolveRelative(filename, specifier) {
  if (!specifier.startsWith('.')) return null
  const directory = filename.split(/[\\/]/u).slice(0, -1)
  const segments = specifier.split('/').filter((segment) => segment !== '.')
  const up = segments.filter((segment) => segment === '..').length
  // A specifier climbs first and then descends (`../../types/index.js`), so the `..`s lead.
  return [...directory.slice(0, directory.length - up), ...segments.slice(up)].join('/')
}

/**
 * The TSDoc block (`/** … *\/`) written directly above a node.
 *
 * @param text - the whole source
 * @param node - the statement the block would sit above
 * @returns the block with its markers, or null when there is none
 */
export function leadingTsdoc(text, node) {
  const [start] = rangeOf(node)
  const before = text.slice(0, start).trimEnd()
  if (!before.endsWith('*/')) return null
  const open = before.lastIndexOf('/**')
  if (open === -1) return null
  // A block comment that opens with `/*` but not `/**` closes before the end, so it is not TSDoc.
  return before.indexOf('*/', open) === before.length - 2 ? before.slice(open) : null
}

function isFunctionInit(declarator) {
  const init = declarator.init
  return (
    init?.type === 'ArrowFunctionExpression' ||
    init?.type === 'FunctionExpression' ||
    // `export const handler: RouteHandler<typeof route> = (c) => …`
    (declarator.id.typeAnnotation !== undefined &&
      declarator.id.typeAnnotation !== null &&
      init !== null &&
      init !== undefined)
  )
}

/**
 * The functions and classes an export statement declares: a function declaration, a class, or a
 * const holding a function. Each comes with the node its TSDoc sits above (the export).
 *
 * @param node - an ExportNamedDeclaration
 * @returns name, kind, the function node (null when it is not written inline) and the export
 */
export function exportedDeclarations(node) {
  const declaration = node.declaration
  if (declaration?.type === 'FunctionDeclaration' && declaration.id) {
    return [{ name: declaration.id.name, kind: 'function', fn: declaration, node }]
  }
  if (declaration?.type === 'ClassDeclaration' && declaration.id) {
    return [{ name: declaration.id.name, kind: 'class', fn: null, node }]
  }
  if (declaration?.type === 'VariableDeclaration') {
    return declaration.declarations
      .filter((d) => d.id.type === 'Identifier' && isFunctionInit(d))
      .map((d) => ({
        name: d.id.name,
        kind: 'function',
        fn:
          d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression'
            ? d.init
            : null,
        node,
      }))
  }
  return []
}
