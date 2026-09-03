// Repo-specific convention plugin (an oxlint JS plugin using the alpha ESLint-compatible API).
// It reads the meaning of an initializer from the AST, which a glob cannot express:
//   custom/effect-gen-return        every `Effect.gen` is written as
//                                   `function name(...) { return Effect.gen(function* () { ... }) }`
//                                   (a trailing `.pipe(...)` is allowed for scoping /u recovery)
//   custom/no-effect-fn             `Effect.fn` /u `Effect.fnUntraced` never appear - the shape above
//                                   is the one way to write an Effect-returning function
//   custom/no-effect-flatmap        `Effect.flatMap` /u `Effect.andThen` never appear - control
//                                   flow is written as straight-line `Effect.gen`
//   custom/usecase-gen-straight-line in usecases/u, `Effect.map` / `Effect.tap` are folded into the
//                                   gen block - a trailing `.pipe(...)` is for error recovery only
//   custom/function-declaration     a module-level function is a `function` declaration, not an
//                                   anonymous function bound to a const (an annotated const such as
//                                   `const h: RouteHandler<...> = (c) => ...` keeps its contextual type)
//   custom/schema-pascal-case       zod/valibot schemas (variables initialized by a `z.*` /u `v.*`
//                                   call) are PascalCase - a schema names a shape
//   custom/schema-meta              schemas document themselves - zod needs `.meta({...})` or
//                                   `.describe()`, valibot needs `v.metadata()` /u `v.description()`
//                                   in the chain (same idea as `@example` in main.tsp)
//   custom/schema-blank-line        schema declarations are separated by a blank line
//   custom/schema-property-meta     properties of `z.object({...})` document themselves one by one -
//                                   the property row is what a reader of the generated docs sees
//   custom/schema-example           writable kinds (string /u number / boolean /u enum) show a real
//                                   value via `.meta({ example })` - a description alone leaves the
//                                   reader guessing
//   custom/schema-example-type      that example must parse against its own schema
//                                   (no `example: 1` on a `z.array(...)`)
//   custom/logic-camel-case         everything else in application logic is camelCase
//                                   (UPPER_SNAKE constants allowed)
//   custom/layer-suffix-pascal-case names ending in *UseCase /u *Service / *Domain start uppercase
//   custom/no-usecase-to-usecase    a usecase never imports another usecase
//   custom/no-null-coercion-map     services return the driver's own absence value - no
//                                   `.pipe(Effect.map((v) => v ?? null))` on a lookup result
//   custom/no-dual-absence          a `Create*` schema property is optional or nullable, never both
//   custom/no-let                   no `let` outside a `for` statement head - write the value as
//                                   one const expression
//   custom/no-mutation              no writing through a const binding - member assignment,
//                                   `delete`, ++/u-- on a property, and the mutating array methods
//                                   are banned
//   custom/predicate-is-name        a pure boolean predicate is `is*` (schema `Is*Input`),
//                                   never `readIs*`
//   custom/layer-namespace-import   a usecases/services/domain module is imported as a whole and
//                                   through its layer barrel,
//                                   `import * as PrismaUseCase from '../usecases/index.js'`
//                                   (`*Service`, `*Domain` likewise) - the namespace names the
//                                   module the path no longer does. A sibling of the same layer
//                                   is imported directly (`./load.js`), the barrel would be a
//                                   cycle; the client imports lib through lib/index.js; every
//                                   other namespace import stays banned (zod/valibot aside)
// Tests are exempt from the structural rules (effect-gen-return, function-declaration, no-let,
// no-mutation): a test arranges and asserts imperatively when that is the clearest way to spell
// the fixture out.
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/u
const CAMEL_CASE = /^[a-z][A-Za-z0-9]*$/u
const UPPER_SNAKE = /^[A-Z][A-Z0-9_]*$/u
const LAYER_SUFFIX = /(UseCase|Service|Domain)$/u
const TEST_FILE = /\.test\.tsx?$/u

const STUDIO_SERVER = /(^|[\\/])studio[\\/]server[\\/]/u
const STUDIO_CLIENT = /(^|[\\/])studio[\\/]client[\\/]/u
const CLIENT_LIB_IMPORT = /(^|\/)lib\/([\w-]+)\.js$/u
const LAYER_DIRECTORY = /(^|[\\/])(usecases|services|domain)[\\/][^\\/]+\.tsx?$/u
const LAYER_IMPORT = /^\.\.\/(usecases|services|domain)\/([\w-]+)\.js$/u
const SIBLING_IMPORT = /^\.\/([\w-]+)\.js$/u
const ROOT_LAYER_IMPORT = /^\.\/(usecases|services|domain)\/([\w-]+)\.js$/u
const LAYER_SUFFIXES = { usecases: 'UseCase', services: 'Service', domain: 'Domain' }
const NAMESPACE_ALLOWED = new Set(['zod', 'valibot'])

const USECASE_MODULE = /(^|[\\/])usecases[\\/][^\\/]+\.tsx?$/u
const USECASE_BARREL = /(^|[\\/])usecases[\\/]index\.tsx?$/u
const SERVICE_MODULE = /(^|[\\/])services[\\/][^\\/]+\.tsx?$/u
const SERVICE_BARREL = /(^|[\\/])services[\\/]index\.tsx?$/u

/**
 * File-scope check for `custom/no-usecase-to-usecase` and `custom/usecase-gen-straight-line`.
 *
 * @param filename - path of the file under lint (either `/` or `\` separators)
 * @returns true for a module body directly under usecases/ (false for index.ts and tests)
 */
export function isUseCaseModulePath(filename) {
  return (
    USECASE_MODULE.test(filename) && !USECASE_BARREL.test(filename) && !TEST_FILE.test(filename)
  )
}

/**
 * File-scope check for `custom/no-null-coercion-map`.
 *
 * @param filename - path of the file under lint (either `/` or `\` separators)
 * @returns true for a module body directly under services/ (false for index.ts and tests)
 */
export function isServiceModulePath(filename) {
  return (
    SERVICE_MODULE.test(filename) && !SERVICE_BARREL.test(filename) && !TEST_FILE.test(filename)
  )
}

/**
 * Whether an import target points at the same usecases layer.
 *
 * @param source - the module specifier of the import statement
 * @returns true for a sibling usecase (`./x`) or a usecases path (`.../usecases/x`)
 */
export function isUseCaseSpecifier(source) {
  return source.startsWith('./') ? true : /(^|\/)usecases(\/|$)/u.test(source)
}

/**
 * Whether the file under lint is a test file (exempt from the structural rules).
 *
 * @param filename - path of the file under lint
 * @returns true for `*.test.ts` / `*.test.tsx`
 */
export function isTestPath(filename) {
  return TEST_FILE.test(filename)
}

function filenameOf(context) {
  return context.filename ?? context.getFilename?.() ?? ''
}

/**
 * The layer module an import points at, seen from the file under lint.
 *
 * @param filename - path of the file under lint
 * @param source - the module specifier of the import statement
 * @returns the layer, the module name (`index` for the barrel) and whether it is a sibling in
 *   the same layer, or null when the import is not a layer module
 */
export function layerModuleOf(filename, source) {
  const layerImport = LAYER_IMPORT.exec(source) ?? ROOT_LAYER_IMPORT.exec(source)
  if (layerImport) return { layer: layerImport[1], module: layerImport[2], sibling: false }
  const directory = LAYER_DIRECTORY.exec(filename)
  const sibling = SIBLING_IMPORT.exec(source)
  if (directory && sibling) return { layer: directory[2], module: sibling[1], sibling: true }
  return null
}

/**
 * The namespace a layer module is imported as: the module name in PascalCase plus its layer suffix.
 *
 * @param layer - usecases, services or domain
 * @param module - the file name without extension (`database-error`)
 * @returns e.g. `DatabaseErrorDomain`
 */
export function layerNamespaceOf(layer, module) {
  const pascal = module
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  return `${pascal}${LAYER_SUFFIXES[layer]}`
}

// Walk `a.b.c[k]` down to the base object (`a`).
function memberRootObject(node) {
  return node.type === 'MemberExpression' ? memberRootObject(node.object) : node
}

// The Array methods that write the receiver in place. Their copying counterparts
// (toSorted /u toReversed / with /u concat / spread) return a new array instead.
const MUTATING_ARRAY_METHODS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
])

// `Effect.<name>` member accesses, the shape every combinator ban below keys on.
function effectMember(node) {
  return node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    node.object.name === 'Effect' &&
    node.property.type === 'Identifier'
    ? node.property.name
    : null
}

// Walk a chain such as `z.object({...})` /u `z.string().min(1)` / `v.pipe(...)` down to its
// root and return the root identifier name (`z.coerce.number().int()` still reaches 'z').
function rootIdentifier(node) {
  if (!node) return null
  if (node.type === 'CallExpression') return rootIdentifier(node.callee)
  if (node.type === 'MemberExpression') return rootIdentifier(node.object)
  if (node.type === 'Identifier') return node.name
  return null
}

// Collect every method name along a chain (`z.object({...}).meta({...})` -> ['meta', 'object']).
function chainMethodNames(node, names = []) {
  if (!node) return names
  if (node.type === 'CallExpression') {
    const callee = node.callee
    const own =
      callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
        ? [callee.property.name]
        : []
    return chainMethodNames(callee, [...names, ...own])
  }
  if (node.type === 'MemberExpression') return chainMethodNames(node.object, names)
  return names
}

// Find the first argument of a `.name(...)` call in a chain.
function chainCallArgument(node, name) {
  if (!node) return null
  if (node.type === 'CallExpression') {
    const callee = node.callee
    if (
      callee.type === 'MemberExpression' &&
      callee.property.type === 'Identifier' &&
      callee.property.name === name
    ) {
      return node.arguments[0] ?? null
    }
    return chainCallArgument(callee, name)
  }
  if (node.type === 'MemberExpression') return chainCallArgument(node.object, name)
  return null
}

// Operations called on z /u v that do not build a schema. `z.safeParse(S, x)` is the
// contract-validation idiom, not a schema definition.
const NON_FACTORY = new Set([
  'safeParse',
  'parse',
  'safeParseAsync',
  'parseAsync',
  'decode',
  'encode',
  'safeDecode',
  'safeEncode',
  'flattenError',
  'treeifyError',
  'prettifyError',
  'formatError',
  'toJSONSchema',
  'config',
  'getGlobalConfig',
  'setGlobalConfig',
  'infer',
])

function hasNonFactoryCall(init) {
  return chainMethodNames(init).some((name) => NON_FACTORY.has(name))
}

// Schemas derived from an existing one (`Base.extend({...})`): the root is another schema
// variable (PascalCase) and the chain calls a derivation method.
const DERIVATION_METHODS = new Set([
  'extend',
  'safeExtend',
  'omit',
  'pick',
  'partial',
  'required',
  'merge',
  'catchall',
  'strict',
  'passthrough',
  'strip',
])

function isDerivedSchemaInit(init) {
  if (init?.type !== 'CallExpression') return false
  const root = rootIdentifier(init)
  if (root === null || !PASCAL_CASE.test(root)) return false
  return chainMethodNames(init).some((name) => DERIVATION_METHODS.has(name))
}

// "Is this a zod/valibot schema definition" is decided by the initializer rooting at z /u v
// with no non-factory operation (safeParse and friends) in the chain. This repo never
// aliases z /u v (lint allows the namespace import only under those names).
function isSchemaInit(init) {
  return (
    init?.type === 'CallExpression' &&
    (['z', 'v'].includes(rootIdentifier(init)) || isDerivedSchemaInit(init)) &&
    !hasNonFactoryCall(init)
  )
}

// meta() has to carry a description or an example. Anything that is not an object literal
// (a variable, a spread) cannot be read statically, so it passes.
const META_KEYS = new Set(['description', 'example', 'examples'])

function hasDocumentingKey(node) {
  return (
    node?.type !== 'ObjectExpression' ||
    node.properties.some(
      (property) =>
        property.type === 'Property' &&
        property.key.type === 'Identifier' &&
        META_KEYS.has(property.key.name),
    )
  )
}

// valibot has no `.meta()`; it passes `v.pipe(schema, v.metadata({...}))` /u
// `v.description('...')` as arguments instead. Look at the arguments of every call in the chain.
function valibotMetaArgument(node) {
  if (node?.type !== 'CallExpression') return null
  const own = node.arguments.find(
    (argument) =>
      argument.type === 'CallExpression' &&
      argument.callee.type === 'MemberExpression' &&
      argument.callee.object.type === 'Identifier' &&
      argument.callee.object.name === 'v' &&
      argument.callee.property.type === 'Identifier' &&
      ['metadata', 'description'].includes(argument.callee.property.name),
  )
  const inner =
    node.callee.type === 'MemberExpression' ? valibotMetaArgument(node.callee.object) : null
  return own ?? inner
}

function declarationOf(statement) {
  return statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
}

// Whether a statement is a schema declaration (both `const X = z...` and `export const X = z...`).
function isSchemaStatement(statement) {
  const declaration = declarationOf(statement)
  if (declaration?.type !== 'VariableDeclaration') return false
  return declaration.declarations.some(
    (declarator) => declarator.id.type === 'Identifier' && isSchemaInit(declarator.init),
  )
}

// Return the shape of `z.object({...})` (the ObjectExpression first argument), even mid-chain
// (`z.object({...}).readonly()`). For a derived schema (`Base.extend({...})`) the added
// properties are the shape.
function objectShapeArgument(init) {
  const argument = chainCallArgument(init, 'object') ?? chainCallArgument(init, 'extend')
  return argument?.type === 'ObjectExpression' ? argument : null
}

// Whether one schema documents itself (zod's .meta/u.describe, valibot's
// v.metadata/v.description).
function isDocumentedSchema(init) {
  if (rootIdentifier(init) === 'v') {
    const metaArgument = valibotMetaArgument(init)
    return metaArgument !== null && hasDocumentingKey(metaArgument.arguments[0])
  }
  const methods = chainMethodNames(init)
  if (methods.includes('describe')) return true
  return methods.includes('meta') && hasDocumentingKey(chainCallArgument(init, 'meta'))
}

function isTypeAliasStatement(statement) {
  return declarationOf(statement)?.type === 'TSTypeAliasDeclaration'
}

// Whether there is a blank line between two statements. `node.loc` excludes comments, so read
// the actual source span and look for a line whose content is empty.
function hasBlankLineBetween(text, previous, current) {
  const from = previous.range?.[1] ?? previous.end
  const to = current.range?.[0] ?? current.start
  if (typeof from !== 'number' || typeof to !== 'number' || to <= from) return true
  const between = text.slice(from, to).split('\n')
  return between.slice(1, -1).some((line) => line.trim() === '')
}

// --- shared parts for inspecting example values (schema-example /u schema-example-type) ---
const STRING_FACTORIES = new Set([
  'string',
  'cuid',
  'cuid2',
  'uuid',
  'guid',
  'ulid',
  'nanoid',
  'xid',
  'ksuid',
  'email',
  'url',
  'httpUrl',
  'emoji',
  'base64',
  'base64url',
  'jwt',
  'hex',
  'ipv4',
  'ipv6',
  'cidrv4',
  'cidrv6',
  'hostname',
  'e164',
  'iso',
])

const NUMBER_FACTORIES = new Set([
  'number',
  'int',
  'int32',
  'uint32',
  'float32',
  'float64',
  'safeInt',
  'bigint',
])

// Kinds that cannot be written down as a literal are out of scope for the example rules.
const OPAQUE_FACTORIES = new Set([
  'any',
  'unknown',
  'never',
  'void',
  'null',
  'undefined',
  'nan',
  'symbol',
  'date',
  'file',
  'blob',
  'instanceof',
  'custom',
  'union',
  'discriminatedUnion',
  'intersection',
  'lazy',
  'map',
  'set',
  'promise',
  'function',
  'json',
  'stringbool',
  'templateLiteral',
  'preprocess',
])

// A zod chain reads outside-in (`z.string().array().meta()` -> ['meta','array','string']),
// so the first kind-deciding method seen from the outside is the schema's actual kind.
function effectiveKind(init) {
  const names = chainMethodNames(init)
  if (names.some((name) => ['transform', 'pipe', 'codec'].includes(name))) return null
  const decided = names.map((name) => {
    if (['object', 'strictObject', 'looseObject', 'record', 'partialRecord'].includes(name)) {
      return 'object'
    }
    if (name === 'array' || name === 'tuple') return 'array'
    if (STRING_FACTORIES.has(name)) return 'string'
    if (NUMBER_FACTORIES.has(name)) return 'number'
    if (name === 'boolean') return 'boolean'
    if (name === 'enum' || name === 'nativeEnum') return 'enum'
    if (name === 'literal') return 'literal'
    if (OPAQUE_FACTORIES.has(name)) return 'opaque'
    return null
  })
  const first = decided.find((kind) => kind !== null) ?? null
  return first === 'opaque' ? null : first
}

// The kind of the value written as the example. Expressions that cannot be read statically
// (identifiers, calls, spreads) are null.
function exampleKind(node) {
  if (node === null || node === undefined) return null
  if (node.type === 'Literal') {
    if (typeof node.value === 'string') return 'string'
    if (typeof node.value === 'number' || typeof node.value === 'bigint') return 'number'
    if (typeof node.value === 'boolean') return 'boolean'
    return null
  }
  if (node.type === 'UnaryExpression' && node.argument.type === 'Literal') {
    return typeof node.argument.value === 'number' ? 'number' : null
  }
  if (node.type === 'TemplateLiteral') return node.expressions.length === 0 ? 'string' : null
  if (node.type === 'ArrayExpression') return 'array'
  if (node.type === 'ObjectExpression') return 'object'
  return null
}

// The members of `z.enum([...])`. Anything other than a literal array cannot be read.
function enumMembers(init) {
  const argument = chainCallArgument(init, 'enum')
  if (argument?.type !== 'ArrayExpression') {
    return null
  }
  return argument.elements
    .filter((element) => element?.type === 'Literal' && typeof element.value === 'string')
    .map((element) => element.value)
}

// The object literal passed to .meta({...}) (null when absent or unreadable).
function metaObject(init) {
  const argument = chainCallArgument(init, 'meta')
  return argument?.type === 'ObjectExpression' ? argument : null
}

function metaProperty(object, key) {
  return (
    object.properties.find(
      (property) =>
        property.type === 'Property' &&
        property.key.type === 'Identifier' &&
        property.key.name === key,
    ) ?? null
  )
}

// A schema declaration and its object properties - the two things the example rules look at.
function eachDocumentedSchema(node, visit) {
  if (node.id.type !== 'Identifier' || !isSchemaInit(node.init)) return
  // valibot shapes its v.metadata() differently. The example rules only look at zod schemas.
  if (rootIdentifier(node.init) === 'v') return
  visit(node.init, node.id, node.id.name)
  const shape = objectShapeArgument(node.init)
  if (shape === null) return
  for (const property of shape.properties) {
    if (
      property.type !== 'Property' ||
      property.key.type !== 'Identifier' ||
      !isSchemaInit(property.value)
    ) {
      continue
    }
    visit(property.value, property.key, `${node.id.name}.${property.key.name}`)
  }
}

// --- Effect.gen shape ---
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
])

function enclosingFunction(node) {
  if (!node) return null
  return FUNCTION_TYPES.has(node.type) ? node : enclosingFunction(node.parent)
}

// `Effect.gen(...)` may be followed by `.pipe(...)` calls; return the outermost call of that chain.
function outermostPipe(node) {
  const parent = node.parent
  if (
    parent?.type === 'MemberExpression' &&
    parent.object === node &&
    parent.property.type === 'Identifier' &&
    parent.property.name === 'pipe' &&
    parent.parent?.type === 'CallExpression' &&
    parent.parent.callee === parent
  ) {
    return outermostPipe(parent.parent)
  }
  return node
}

function isAnonymousFunctionInit(init) {
  return (
    init !== null &&
    init !== undefined &&
    (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
  )
}

const plugin = {
  meta: { name: 'custom' },
  rules: {
    'effect-gen-return': {
      meta: {
        docs: {
          description:
            'Effect.gen is written as `function name() { return Effect.gen(function* () { ... }) }`',
        },
      },
      create(context) {
        if (isTestPath(filenameOf(context))) return {}
        return {
          CallExpression(node) {
            if (effectMember(node.callee) !== 'gen') return
            const body = node.arguments[0]
            if (body?.type !== 'FunctionExpression' || !body.generator || body.id) {
              context.report({
                node,
                message:
                  'Write the generator inline and anonymous: `Effect.gen(function* () { ... })`.',
              })
              return
            }
            const outer = outermostPipe(node)
            const parent = outer.parent
            const owner = parent?.type === 'ReturnStatement' ? enclosingFunction(parent) : null
            if (
              owner !== null &&
              (owner.type === 'FunctionDeclaration' || owner.type === 'FunctionExpression')
            ) {
              return
            }
            context.report({
              node,
              message:
                'An Effect program is the return value of a `function`: `export function name(input) { return Effect.gen(function* () { ... }) }`. Neither a const-bound arrow nor an inline argument - the declaration names the program, and the reader finds every step under one `return`.',
            })
          },
        }
      },
    },
    'no-effect-fn': {
      meta: { docs: { description: 'Effect.fn / Effect.fnUntraced never appear' } },
      create(context) {
        return {
          MemberExpression(node) {
            const name = effectMember(node)
            if (name === 'fn' || name === 'fnUntraced') {
              context.report({
                node,
                message: `\`Effect.${name}\` hides the function behind a factory call. Write \`export function name(input) { return Effect.gen(function* () { ... }) }\` instead.`,
              })
            }
          },
        }
      },
    },
    'no-effect-flatmap': {
      meta: {
        docs: {
          description: 'Effect.flatMap/andThen never appear - write straight-line Effect.gen',
        },
      },
      create(context) {
        return {
          MemberExpression(node) {
            const name = effectMember(node)
            if (name === 'flatMap' || name === 'andThen') {
              context.report({
                node,
                message: `\`Effect.${name}\` buries the control flow one closure deep. Write the step as a plain \`yield*\` inside \`Effect.gen\`, with failures as early-return guards.`,
              })
            }
          },
        }
      },
    },
    'usecase-gen-straight-line': {
      meta: {
        docs: { description: 'in usecases/, happy-path combinators are folded into the gen block' },
      },
      create(context) {
        if (!isUseCaseModulePath(filenameOf(context))) return {}
        return {
          MemberExpression(node) {
            const name = effectMember(node)
            if (name === 'map' || name === 'tap') {
              context.report({
                node,
                message: `\`Effect.${name}\` in a usecase belongs inside the \`Effect.gen\` block as a plain statement. A trailing \`.pipe(...)\` is for error recovery only (catchTag / orElseSucceed /u matchEffect).`,
              })
            }
          },
        }
      },
    },
    'function-declaration': {
      meta: {
        docs: { description: 'module-level functions are function declarations' },
      },
      create(context) {
        if (isTestPath(filenameOf(context))) return {}
        return {
          Program(node) {
            for (const statement of node.body) {
              const declaration = declarationOf(statement)
              if (declaration?.type !== 'VariableDeclaration') continue
              for (const declarator of declaration.declarations) {
                if (declarator.id.type !== 'Identifier' || declarator.id.typeAnnotation) continue
                if (!isAnonymousFunctionInit(declarator.init)) continue
                context.report({
                  node: declarator.id,
                  message: `Declare \`${declarator.id.name}\` as \`function ${declarator.id.name}(...) { ... }\`. A named declaration reads as what it is, hoists, and shows up by name in stack traces; an anonymous function bound to a const is only warranted when the const carries a contextual type annotation.`,
                })
              }
            }
          },
        }
      },
    },
    'schema-pascal-case': {
      meta: { docs: { description: 'zod/valibot schemas must be PascalCase' } },
      create(context) {
        return {
          VariableDeclarator(node) {
            if (
              node.id.type === 'Identifier' &&
              isSchemaInit(node.init) &&
              !PASCAL_CASE.test(node.id.name)
            ) {
              context.report({
                node: node.id,
                message: `Schema \`${node.id.name}\` must be PascalCase (zod/valibot schemas are values that name a shape).`,
              })
            }
          },
        }
      },
    },
    'schema-meta': {
      meta: { docs: { description: 'zod/valibot schemas must carry meta/example documentation' } },
      create(context) {
        return {
          VariableDeclarator(node) {
            if (node.id.type !== 'Identifier' || !isSchemaInit(node.init)) return
            const name = node.id.name
            if (rootIdentifier(node.init) === 'v') {
              const metaArgument = valibotMetaArgument(node.init)
              if (metaArgument === null) {
                context.report({
                  node: node.id,
                  message: `Schema \`${name}\` must document itself: pipe \`v.metadata({ description, example })\` or \`v.description(...)\` into it.`,
                })
              } else if (!hasDocumentingKey(metaArgument.arguments[0])) {
                context.report({
                  node: node.id,
                  message: `Schema \`${name}\`'s v.metadata() must contain \`description\`, \`example\` or \`examples\`.`,
                })
              }
              return
            }
            const methods = chainMethodNames(node.init)
            if (methods.includes('describe')) return
            if (!methods.includes('meta')) {
              context.report({
                node: node.id,
                message: `Schema \`${name}\` must document itself: chain \`.meta({ description, example })\` or \`.describe(...)\`.`,
              })
              return
            }
            if (!hasDocumentingKey(chainCallArgument(node.init, 'meta'))) {
              context.report({
                node: node.id,
                message: `Schema \`${name}\`'s .meta() must contain \`description\`, \`example\` or \`examples\`.`,
              })
            }
          },
        }
      },
    },
    'schema-blank-line': {
      meta: { docs: { description: 'schema declarations are separated by a blank line' } },
      create(context) {
        return {
          Program(node) {
            const text = context.sourceCode?.text ?? context.getSourceCode?.().text ?? ''
            const body = node.body ?? []
            for (const [index, current] of body.entries()) {
              if (index === 0) continue
              const previous = body[index - 1]
              if (!isSchemaStatement(previous) && !isSchemaStatement(current)) continue
              // `type X = z.infer<typeof X>` right after its schema is one set with it.
              if (isTypeAliasStatement(current)) continue
              if (hasBlankLineBetween(text, previous, current)) continue
              context.report({
                node: current,
                message:
                  'Put a blank line between schema declarations. Chained schemas run together into one wall of `.meta(...)` lines, and the reader cannot see where one shape ends and the next begins.',
              })
            }
          },
        }
      },
    },
    'schema-property-meta': {
      meta: { docs: { description: 'object schema properties document themselves' } },
      create(context) {
        return {
          VariableDeclarator(node) {
            if (node.id.type !== 'Identifier' || !isSchemaInit(node.init)) return
            const shape = objectShapeArgument(node.init)
            if (shape === null) return
            for (const property of shape.properties) {
              if (
                property.type !== 'Property' ||
                property.key.type !== 'Identifier' ||
                !isSchemaInit(property.value)
              ) {
                continue
              }
              if (isDocumentedSchema(property.value)) continue
              context.report({
                node: property.key,
                message: `Property \`${property.key.name}\` of \`${node.id.name}\` must document itself: chain \`.meta({ description, example })\` or \`.describe(...)\` onto it. The property is what the reader of the generated docs actually sees.`,
              })
            }
          },
        }
      },
    },
    'schema-example': {
      meta: { docs: { description: 'schemas show a concrete example value' } },
      create(context) {
        return {
          VariableDeclarator(node) {
            eachDocumentedSchema(node, (init, reportNode, label) => {
              const kind = effectiveKind(init)
              if (kind !== 'string' && kind !== 'number' && kind !== 'boolean' && kind !== 'enum') {
                return
              }
              const object = metaObject(init)
              // A missing or unreadable .meta() belongs to schema-meta /u schema-property-meta.
              if (object === null) return
              if (metaProperty(object, 'example') || metaProperty(object, 'examples')) return
              context.report({
                node: reportNode,
                message: `\`${label}\` must show a value: add \`example\` (or \`examples\`) to its .meta(). A description alone leaves the reader guessing what a real value looks like - write the value they would actually send.`,
              })
            })
          },
        }
      },
    },
    'schema-example-type': {
      meta: { docs: { description: 'the example matches the schema it documents' } },
      create(context) {
        return {
          VariableDeclarator(node) {
            eachDocumentedSchema(node, (init, reportNode, label) => {
              const object = metaObject(init)
              if (object === null) return
              const example = metaProperty(object, 'example')
              if (example === null) return
              const kind = effectiveKind(init)
              const written = exampleKind(example.value)
              if (kind === null || written === null) return
              if (kind === 'literal') return
              if (kind === 'enum') {
                if (written !== 'string') {
                  context.report({
                    node: example.value,
                    message: `\`${label}\` is an enum but its example is a ${written}. Write one of the members.`,
                  })
                  return
                }
                const members = enumMembers(init)
                if (members !== null && !members.includes(example.value.value)) {
                  context.report({
                    node: example.value,
                    message: `\`${label}\`'s example '${example.value.value}' is not one of [${members.join(', ')}].`,
                  })
                }
                return
              }
              if (kind !== written) {
                context.report({
                  node: example.value,
                  message: `\`${label}\` is a ${kind} schema but its example is a ${written}. An example that cannot parse against its own schema is worse than none - it teaches the reader the wrong shape.`,
                })
              }
            })
          },
        }
      },
    },
    'logic-camel-case': {
      meta: { docs: { description: 'application logic must be camelCase' } },
      create(context) {
        function check(idNode) {
          const name = idNode.name
          if (LAYER_SUFFIX.test(name)) return
          if (!CAMEL_CASE.test(name) && !UPPER_SNAKE.test(name)) {
            context.report({
              node: idNode,
              message: `\`${name}\` must be camelCase (application logic) or UPPER_SNAKE (constants).`,
            })
          }
        }
        return {
          VariableDeclarator(node) {
            if (node.id.type === 'Identifier' && !isSchemaInit(node.init)) check(node.id)
          },
          FunctionDeclaration(node) {
            if (node.id) check(node.id)
          },
        }
      },
    },
    'layer-namespace-import': {
      meta: {
        docs: {
          description:
            'usecases/services/domain modules are imported as `import * as XxxUseCase|XxxService|XxxDomain` through their layer barrel (a sibling of the same layer directly); the client imports lib through lib/index.js',
        },
      },
      create(context) {
        const filename = filenameOf(context)
        if (isTestPath(filename)) return {}
        const client = STUDIO_CLIENT.test(filename)
        if (!client && !STUDIO_SERVER.test(filename)) return {}
        return {
          ImportDeclaration(node) {
            const source = node.source?.value
            if (typeof source !== 'string') return
            if (client) {
              const lib = CLIENT_LIB_IMPORT.exec(source)
              if (lib && lib[2] !== 'index') {
                context.report({
                  node: node.source,
                  message: `Import \`${lib[2]}\` through the barrel: \`from '${source.replace(/[\w-]+\.js$/u, 'index.js')}'\`.`,
                })
              }
              return
            }
            const namespace = node.specifiers.find((s) => s.type === 'ImportNamespaceSpecifier')
            const target = layerModuleOf(filename, source)
            if (target === null) {
              if (namespace && !NAMESPACE_ALLOWED.has(source)) {
                context.report({
                  node: namespace,
                  message: `Namespace imports are for usecases/services/domain modules (and zod/valibot); import \`${source}\` by name.`,
                })
              }
              return
            }
            // A sibling of the same layer keeps the direct import: its barrel re-exports the
            // importing module, which would be a cycle.
            const barrel = target.sibling ? source : source.replace(/[\w-]+\.js$/u, 'index.js')
            if (!target.sibling && target.module !== 'index') {
              context.report({
                node: node.source,
                message: `Import the ${target.layer} layer through its barrel: \`from '${barrel}'\`.`,
              })
              return
            }
            if (target.sibling && target.module === 'index') {
              context.report({
                node: node.source,
                message: `A ${target.layer} module imports its sibling directly, not the barrel it is part of: \`from './xxx.js'\`.`,
              })
              return
            }
            const suffix = LAYER_SUFFIXES[target.layer]
            // A sibling is named after the module its path already names; through the barrel the
            // path names none, so any `Xxx${suffix}` stands for the module it is used for.
            const expected = target.sibling
              ? layerNamespaceOf(target.layer, target.module)
              : `Xxx${suffix}`
            if (!namespace || node.specifiers.length !== 1) {
              context.report({
                node,
                message: `Import the ${target.layer} module as a whole: \`import * as ${expected} from '${barrel}'\`, then call \`${expected}.fn(...)\`.`,
              })
              return
            }
            if (target.sibling) {
              if (namespace.local.name !== expected) {
                context.report({
                  node: namespace,
                  message: `\`${namespace.local.name}\` must be named after its module and layer: \`${expected}\`.`,
                })
              }
              return
            }
            if (!new RegExp(`^[A-Z][A-Za-z0-9]*${suffix}$`, 'u').test(namespace.local.name)) {
              context.report({
                node: namespace,
                message: `\`${namespace.local.name}\` must name the ${target.layer} module it stands for and end with \`${suffix}\` (\`import * as ${expected} from '${barrel}'\`).`,
              })
            }
          },
        }
      },
    },
    'layer-suffix-pascal-case': {
      meta: { docs: { description: '*UseCase/*Service/u*Domain names start uppercase' } },
      create(context) {
        function check(idNode) {
          const name = idNode.name
          if (LAYER_SUFFIX.test(name) && !/^[A-Z]/u.test(name)) {
            context.report({
              node: idNode,
              message: `\`${name}\` ends with a layer suffix and must start with an uppercase letter.`,
            })
          }
        }
        return {
          VariableDeclarator(node) {
            if (node.id.type === 'Identifier') check(node.id)
          },
          FunctionDeclaration(node) {
            if (node.id) check(node.id)
          },
          ClassDeclaration(node) {
            if (node.id) check(node.id)
          },
        }
      },
    },
    'no-usecase-to-usecase': {
      meta: { docs: { description: 'a usecase may not depend on another usecase' } },
      create(context) {
        if (!isUseCaseModulePath(filenameOf(context))) return {}
        function check(node) {
          const source = node.source?.value
          if (typeof source !== 'string' || !isUseCaseSpecifier(source)) return
          context.report({
            node: node.source,
            message: `A usecase may not import another usecase (\`${source}\`). Usecases sit side by side, each one owning a request end to end. Inline the few lines you need, or push the shared part down into a service (I/O) or domain (a pure decision).`,
          })
        }
        return {
          ImportDeclaration: check,
          ExportNamedDeclaration: check,
          ExportAllDeclaration: check,
        }
      },
    },
    'no-null-coercion-map': {
      meta: {
        docs: { description: 'services return the driver absence value, no `?? null` coercion' },
      },
      create(context) {
        if (!isServiceModulePath(filenameOf(context))) return {}
        return {
          CallExpression(node) {
            if (effectMember(node.callee) !== 'map') return
            const fn = node.arguments[0]
            if (
              fn?.type !== 'ArrowFunctionExpression' ||
              fn.params.length !== 1 ||
              fn.params[0].type !== 'Identifier'
            ) {
              return
            }
            const body = fn.body
            if (
              body.type === 'LogicalExpression' &&
              body.operator === '??' &&
              body.left.type === 'Identifier' &&
              body.left.name === fn.params[0].name &&
              body.right.type === 'Literal' &&
              body.right.value === null
            ) {
              context.report({
                node,
                message:
                  "Return the driver's own absence value: coercing `undefined` to `null` here makes callers guess which channel they hold. Drop the pipe and let the caller check `=== undefined`.",
              })
            }
          },
        }
      },
    },
    'no-dual-absence': {
      meta: {
        docs: { description: 'a Create* schema property is optional or nullable, never both' },
      },
      create(context) {
        return {
          VariableDeclarator(node) {
            if (node.id.type !== 'Identifier' || !node.id.name.startsWith('Create')) return
            if (!isSchemaInit(node.init)) return
            const shape = objectShapeArgument(node.init)
            if (shape === null) return
            for (const property of shape.properties) {
              if (
                property.type !== 'Property' ||
                property.key.type !== 'Identifier' ||
                !isSchemaInit(property.value)
              ) {
                continue
              }
              const methods = chainMethodNames(property.value)
              const optional = methods.includes('exactOptional') || methods.includes('optional')
              if (!methods.includes('nullish') && !(optional && methods.includes('nullable'))) {
                continue
              }
              context.report({
                node: property.key,
                message: `Property \`${property.key.name}\` of \`${node.id.name}\` can be absent two ways (undefined and null), so every consumer has to check \`=== undefined || === null\`. Keep one channel: \`.exactOptional()\` alone, or required \`.nullable()\`.`,
              })
            }
          },
        }
      },
    },
    'no-let': {
      meta: { docs: { description: 'no let outside a for statement head' } },
      create(context) {
        if (isTestPath(filenameOf(context))) return {}
        const forHeads = new Set()
        return {
          ForStatement(node) {
            if (node.init !== null && node.init !== undefined) forHeads.add(node.init)
          },
          VariableDeclaration(node) {
            if (node.kind === 'const' || forHeads.has(node)) return
            context.report({
              node,
              message:
                'Declare the value as one `const` expression (a ternary over the deciding condition, or an extracted function) instead of a `let` assigned later - a binding that changes over time makes the reader replay the control flow to know what it holds. A counter may live in a `for(...)` head; a genuinely imperative core states its reason on a `// oxlint-disable-next-line custom/no-let -- <why>` comment.',
            })
          },
        }
      },
    },
    'no-mutation': {
      meta: { docs: { description: 'no writing through a const binding' } },
      create(context) {
        if (isTestPath(filenameOf(context))) return {}
        function reportWrite(node, target, wrote) {
          if (target.type !== 'MemberExpression') return
          if (memberRootObject(target).type === 'ThisExpression') return
          context.report({
            node,
            message: `${wrote} writes into an existing object. Build the changed value instead: spread (\`{ ...value, field }\` / \`[...values, entry]\`), toSorted/toReversed for ordering, Object.fromEntries for indexing. A deliberate mutable cell states its reason on a \`/u/ oxlint-disable-next-line custom/no-mutation -- <why>\` comment.`,
          })
        }
        return {
          AssignmentExpression(node) {
            reportWrite(node, node.left, `\`${node.operator}\``)
          },
          UpdateExpression(node) {
            reportWrite(node, node.argument, `\`${node.operator}\``)
          },
          UnaryExpression(node) {
            if (node.operator === 'delete') reportWrite(node, node.argument, '`delete`')
          },
          CallExpression(node) {
            const callee = node.callee
            if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return
            if (!MUTATING_ARRAY_METHODS.has(callee.property.name)) return
            const receiver = callee.object
            // `[...values].sort(...)` mutates only the fresh copy in the literal.
            if (receiver.type === 'ArrayExpression') return
            if (memberRootObject(receiver).type === 'ThisExpression') return
            const copyFirst =
              callee.property.name === 'sort' || callee.property.name === 'reverse'
                ? `, or copy first: \`[...values].${callee.property.name}(...)\``
                : ''
            context.report({
              node,
              message: `\`.${callee.property.name}(...)\` writes the receiver in place. Build the changed value instead (\`[...values, entry]\`, toSorted/toReversed)${copyFirst}. A deliberate mutable cell states its reason on a \`/u/ oxlint-disable-next-line custom/no-mutation -- <why>\` comment.`,
            })
          },
        }
      },
    },
    'predicate-is-name': {
      meta: { docs: { description: 'a pure boolean predicate is named is*, never readIs*' } },
      create(context) {
        function check(idNode) {
          if (/^(readIs|ReadIs)[A-Z]/u.test(idNode.name)) {
            context.report({
              node: idNode,
              message: `\`${idNode.name}\`: a pure boolean predicate is named \`is*\` (its schema \`Is*Input\`). The \`read\` prefix is for functions that derive a value; demoting \`is\` behind it hides that this is a predicate.`,
            })
          }
        }
        return {
          VariableDeclarator(node) {
            if (node.id.type === 'Identifier') check(node.id)
          },
          FunctionDeclaration(node) {
            if (node.id) check(node.id)
          },
        }
      },
    },
  },
}

export default plugin
