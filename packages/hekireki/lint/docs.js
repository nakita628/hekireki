// Documentation rules for the Studio server. A handler's TSDoc is custom/handler-doc's, which asks
// more of it (the route, every usecase and tag).

import {
  INDEX_FILE,
  TEST_FILE,
  exportedDeclarations,
  filenameOf,
  layerOf,
  leadingTsdoc,
  sourceTextOf,
} from './helpers.js'

// What each layer's TSDoc has to say besides a summary.
const LAYER_TAGS = {
  usecases: { params: true, returns: true, example: false },
  services: { params: true, returns: true, example: false },
  domain: { params: true, returns: true, example: true },
}

// The `@param` names a function's parameters need: `name` for a plain parameter, and
// `name.field` for each field of an object type written inline (`input: { readonly sql: string }`).
// A parameter typed by name (`input: z.infer<typeof X>`) is documented as `name` or field by
// field, `name.field`: the fields say more, and the rule cannot see which there are.
function paramNames(fn) {
  return fn.params.flatMap((param) => {
    const target = param.type === 'AssignmentPattern' ? param.left : param
    if (target.type !== 'Identifier') return []
    const type = target.typeAnnotation?.typeAnnotation
    if (type?.type === 'TSTypeLiteral') {
      return type.members
        .filter((m) => m.type === 'TSPropertySignature' && m.key.type === 'Identifier')
        .map((m) => `${target.name}.${m.key.name}`)
    }
    return [target.name]
  })
}

function hasParam(doc, name) {
  const escaped = name.replaceAll(/[.$]/gu, (ch) => `\\${ch}`)
  // `input.sql` is asked for by name; a plain `input` is met by `@param input` or `@param input.x`.
  const field = name.includes('.') ? '' : '|\\.[\\w$]+'
  return new RegExp(`@param\\s+${escaped}(?:(?![\\w.$])${field})`, 'u').test(doc)
}

function returnsSomething(fn) {
  if (fn === null) return true
  if (fn.type === 'ArrowFunctionExpression' && fn.expression) return true
  const annotated = fn.returnType?.typeAnnotation?.type
  return annotated !== 'TSVoidKeyword' && annotated !== 'TSNeverKeyword'
}

// Report each exported function whose TSDoc does not hold every one of `needles`.
function requireInDoc(context, { needles, message }) {
  const filename = filenameOf(context)
  if (TEST_FILE.test(filename) || INDEX_FILE.test(filename)) return {}
  const text = sourceTextOf(context)
  return {
    ExportNamedDeclaration(node) {
      for (const { name, kind, node: target } of exportedDeclarations(node)) {
        if (kind !== 'function') continue
        const doc = leadingTsdoc(text, target) ?? ''
        if (needles.every((needle) => doc.includes(needle))) continue
        context.report({ node: target, message: message(name) })
      }
    },
  }
}

export const docRules = {
  // Why: an exported function or class is used by people who did not write it. A TSDoc comment
  //      right above it says what it is for, before anyone reads the body. In the layers it also
  //      says what goes in and comes out:
  //        usecases / services : `@param` for each parameter (each field of an inline `input`
  //                              object: `@param input.sql`) and `@returns`
  //        domain              : the same plus `@example` (pure functions can show input → output)
  //   NG: export function makeCell(input: { … }) { … }                 // no TSDoc
  //   OK: /** A cell as the grid shows it. … *\/
  //       export function makeCell(input: { … }) { … }
  'require-tsdoc': {
    meta: { docs: { description: 'exported functions and classes must carry TSDoc' } },
    create(context) {
      const filename = filenameOf(context)
      const layer = layerOf(filename)
      if (TEST_FILE.test(filename) || layer === 'handlers') return {}
      const tags = INDEX_FILE.test(filename) ? null : (LAYER_TAGS[layer] ?? null)
      const text = sourceTextOf(context)
      return {
        ExportNamedDeclaration(node) {
          for (const { name, kind, fn, node: target } of exportedDeclarations(node)) {
            const doc = leadingTsdoc(text, target)
            if (doc === null) {
              context.report({
                node: target,
                message: `\`${name}\` is exported, so it needs a TSDoc comment (/** … */) right above it saying what it ${kind === 'class' ? 'represents' : 'does'}${tags?.params ? ', with `@param` for each parameter and `@returns`' : ''}. People and AI read the TSDoc before they read the body.`,
              })
              continue
            }
            if (tags === null || kind !== 'function') continue
            const missing = [
              ...(tags.params && fn !== null
                ? paramNames(fn)
                    .filter((p) => !hasParam(doc, p))
                    .map((p) => `\`@param ${p}\``)
                : []),
              ...(tags.returns && returnsSomething(fn) && !/@returns\b/u.test(doc)
                ? ['`@returns`']
                : []),
              ...(tags.example && !/@example\b/u.test(doc) ? ['`@example`'] : []),
            ]
            if (missing.length === 0) continue
            context.report({
              node: target,
              message: `The TSDoc of \`${name}\` is missing ${missing.join(', ')}. In ${layer}, document every parameter (each field of an inline \`input\` object as \`@param input.field - …\`) and what comes back (\`@returns …\`)${tags.example ? ', plus an input → output `@example`' : ''}.`,
            })
          }
        },
      }
    },
  },

  // Why: a usecase is easier to review as a picture than as code: who calls whom, in what order,
  //      and where it branches on failure.
  //   NG: /** Deletes rows. *\/ export function deleteRows(input: { … }) { … }
  //   OK: /**
  //        * Deletes rows.
  //        * ```mermaid
  //        * sequenceDiagram
  //        *   participant U as DatabaseUseCase
  //        *   participant S as DatabaseService
  //        *   U->>S: runStatement({ sql, params })
  //        * ```
  //        *\/
  'require-sequence-diagram': {
    meta: {
      docs: { description: 'usecases include a mermaid sequenceDiagram in their TSDoc' },
    },
    create(context) {
      return requireInDoc(context, {
        needles: ['```mermaid', 'sequenceDiagram'],
        message: (name) =>
          `Add a mermaid sequence diagram to the TSDoc of \`${name}\` (\`\`\`mermaid / sequenceDiagram): who calls whom, in what order, and where it branches on failure.`,
      })
    },
  },

  // Why: a service is where the Studio touches the outside world (files, the database, the
  //      language server, the schema engine). A diagram shows what goes in, what it touches and
  //      what comes out before anyone reads the I/O code.
  //   NG: /** Writes the schema file. *\/ export function writeSchemaFile(input: { … }) { … }
  //   OK: /**
  //        * Writes the schema file.
  //        * ```mermaid
  //        * flowchart LR
  //        *   text --> fs[(file system)]
  //        * ```
  //        *\/
  'require-diagram': {
    meta: { docs: { description: 'services include a mermaid diagram in their TSDoc' } },
    create(context) {
      return requireInDoc(context, {
        needles: ['```mermaid'],
        message: (name) =>
          `Add a mermaid diagram to the TSDoc of \`${name}\` (\`\`\`mermaid, e.g. flowchart): what goes in, what it touches (files, the database, a library), and what comes out.`,
      })
    },
  },
}
