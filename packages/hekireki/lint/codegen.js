// Rules for the code generators: what they read from a `///` comment and how they write it back
// out (src/helper, src/generator), and the options each reads against the README (src/core).

import { readFileSync } from 'node:fs'
import path from 'node:path'

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

// `X.generator.config`, through a `?.` too.
function isGeneratorConfig(node) {
  const member = node.type === 'ChainExpression' ? node.expression : node
  return (
    member.type === 'MemberExpression' &&
    !member.computed &&
    member.property.type === 'Identifier' &&
    member.property.name === 'config' &&
    member.object.type === 'MemberExpression' &&
    member.object.property.type === 'Identifier' &&
    member.object.property.name === 'generator'
  )
}

const READMES = new Map()

// The package README beside the `src` the file sits in, read once.
function readmeOf(filename) {
  const at = filename.lastIndexOf(`${path.sep}src${path.sep}`)
  const file = path.join(at === -1 ? '.' : filename.slice(0, at), 'README.md')
  if (!READMES.has(file)) READMES.set(file, readFileSync(file, 'utf8'))
  return READMES.get(file)
}

/**
 * The options a README table row gives a provider: the name in backticks each item of its options
 * cell starts with, values in parentheses left out.
 *
 * @param readme - the README's text
 * @param provider - the provider, `hekireki-zod`
 * @returns the option names, or null when no row names the provider
 */
export function documentedOptions(readme, provider) {
  const row = readme
    .split('\n')
    .find((line) => line.startsWith(`| \`${provider}\``) && line.trimEnd().endsWith('|'))
  if (row === undefined) return null
  const cells = row.split('|').map((cell) => cell.trim())
  const options = (cells.at(-2) ?? '').replaceAll(/\([^)]*\)/gu, '')
  return options
    .split(/[,;]/u)
    .map((item) => /^\s*`([A-Za-z]\w*)`/u.exec(item)?.[1])
    .filter((name) => name !== undefined)
}

// Read from options.generator, not from its config: every generator block has it.
const STANDARD_OPTIONS = new Set(['output'])

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

  // Why: the README's table is how a user finds a generator's options. An option the code reads
  //      and the table leaves out cannot be found; one the table lists and the code no longer
  //      reads is set and silently ignored. Each core module is held to its provider's row.
  //   NG: getBool(options.generator.config?.comment)   // the row of hekireki-zod has no `comment`
  //   NG: | `hekireki-zod` | Zod | `type`, `comment` |   // and src/core/zod.ts reads no comment
  'generator-option-documented': {
    meta: {
      docs: { description: 'the options a generator reads are the ones its README row lists' },
    },
    create(context) {
      const filename = filenameOf(context)
      if (TEST_FILE.test(filename)) return {}
      const provider = `hekireki-${path.basename(filename).replace(/\.tsx?$/u, '')}`
      const configNames = new Set()
      // The member expressions that read an option, collected for Program:exit.
      const read = new Set()
      return {
        VariableDeclarator(node) {
          const init = node.init?.type === 'LogicalExpression' ? node.init.left : node.init
          if (node.id.type === 'Identifier' && init && isGeneratorConfig(init)) {
            configNames.add(node.id.name)
          }
        },
        MemberExpression(node) {
          if (node.computed || node.property.type !== 'Identifier') return
          const object = node.object
          const isConfig =
            isGeneratorConfig(object) ||
            (object.type === 'Identifier' && configNames.has(object.name))
          if (isConfig) read.add(node)
        },
        'Program:exit'(program) {
          const documented = documentedOptions(readmeOf(filename), provider)
          if (documented === null) {
            for (const node of read) {
              context.report({
                node,
                message: `${provider} reads \`${node.property.name}\`, and the README has no table row for ${provider}: add one that lists its options.`,
              })
            }
            return
          }
          const names = new Set([...read].map((node) => node.property.name))
          for (const node of read) {
            if (documented.includes(node.property.name)) continue
            context.report({
              node,
              message: `${provider} reads \`${node.property.name}\`, which its row of the README's options table does not list. Add it to the row.`,
            })
          }
          for (const name of documented) {
            if (names.has(name) || STANDARD_OPTIONS.has(name)) continue
            context.report({
              node: program,
              message: `The README lists \`${name}\` for ${provider}, which ${path.basename(filename)} does not read. Take it out of the row, or read it.`,
            })
          }
        },
      }
    },
  },
}
