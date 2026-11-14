// Rules for the code generators (src/helper, src/generator): what they read from a `///` comment
// and how they write it back out.

import { TEST_FILE, filenameOf } from './helpers.js'

// The functions a DMMF `documentation` may be handed to: `stripAnnotations` for its prose, and the
// readers of the annotation lines a generator acts on. A new annotation reader joins this list.
const DOCUMENTATION_READERS = new Set([
  'stripAnnotations',
  'arCalls',
  'ectoCalls',
  'extractPydanticAnnotation',
  'extractConfigDict',
])

// The node that stands for an expression as an argument: `x?.documentation` is wrapped in a
// ChainExpression.
function argumentNode(node) {
  return node.parent?.type === 'ChainExpression' ? node.parent : node
}

function calleeName(call) {
  return call.callee.type === 'Identifier' ? call.callee.name : null
}

// Whether a piece of text leaves a `/**` open: the comment goes on past it.
function opensDocBlock(text) {
  const open = text.lastIndexOf('/**')
  return open !== -1 && !text.slice(open).includes('*/')
}

// Whether a string builds a doc comment around text it does not hold: a literal that opens one and
// leaves it to what is joined after, or a template that opens one before an interpolation. A
// whole comment written out, such as `/** @var list<string> */`, holds nothing to escape.
function buildsDocBlock(node) {
  if (node.type === 'Literal') return typeof node.value === 'string' && opensDocBlock(node.value)
  if (node.type !== 'TemplateLiteral') return false
  return node.quasis.some((quasi) => opensDocBlock(quasi.value.cooked ?? ''))
}

export const codegenRules = {
  // Why: a `///` comment holds the prose a person wrote and the annotation lines a generator reads
  //      (`@z.uuid()`, `@ar.length(...)`, `@relation ...`). Written out raw, the annotations land
  //      in the generated code as if they were documentation. Reading `documentation` only as the
  //      argument of `stripAnnotations` or of an annotation reader keeps the two apart at the one
  //      place the value enters, and keeps every comment writer taking prose.
  //   NG: goCommentLines(field.documentation)
  //   NG: const doc = field.documentation
  //   OK: goCommentLines(stripAnnotations(field.documentation))
  //   OK: arCalls(model.documentation, 'model')
  'documentation-read': {
    meta: {
      docs: {
        description:
          'a DMMF documentation is read only through stripAnnotations or an annotation reader',
      },
    },
    create(context) {
      if (TEST_FILE.test(filenameOf(context))) return {}
      return {
        MemberExpression(node) {
          if (node.computed || node.property.type !== 'Identifier') return
          if (node.property.name !== 'documentation') return
          const argument = argumentNode(node)
          const call = argument.parent
          const name =
            call?.type === 'CallExpression' && call.arguments.includes(argument)
              ? calleeName(call)
              : null
          if (name !== null && DOCUMENTATION_READERS.has(name)) return
          context.report({
            node,
            message: `Read \`documentation\` as the argument of \`stripAnnotations(...)\` (its prose) or of an annotation reader (${[...DOCUMENTATION_READERS].filter((n) => n !== 'stripAnnotations').join(', ')}). Raw, its \`@z.\` / \`@ar.\` / \`@relation\` lines reach the generated code. A new annotation reader joins DOCUMENTATION_READERS in lint/codegen.js.`,
          })
        },
      }
    },
  },

  // Why: a JSDoc, KDoc or PHPDoc comment built by hand around text forgets that the text can hold
  //      `*/`, which ends the comment and turns the rest into code. `docBlockLines` escapes it, and
  //      keeps one line of prose on one line. A whole comment written out holds nothing to escape.
  //   NG: `/** ${prose} */`
  //   NG: ['/**', ...lines.map((line) => ` * ${line}`), ' */']
  //   OK: docBlockLines(stripAnnotations(model.documentation), '')
  //   OK: '    /** @var list<string> */'
  'doc-block-helper': {
    meta: { docs: { description: 'generated /** */ comments are written by docBlockLines' } },
    create(context) {
      if (TEST_FILE.test(filenameOf(context))) return {}
      function check(node) {
        if (!buildsDocBlock(node)) return
        context.report({
          node,
          message:
            'Write a generated `/** */` comment with `docBlockLines(prose, indent)` from src/utils: it escapes a `*/` in the prose and keeps one line on one line.',
        })
      }
      return { Literal: check, TemplateLiteral: check }
    },
  },
}
