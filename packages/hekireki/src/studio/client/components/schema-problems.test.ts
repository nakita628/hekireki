import { describe, expect, it } from 'vite-plus/test'

import { schemaProblems } from './schema-problems.js'

const NOPE =
  'Type "Nope" is neither a built-in type, nor refers to another model, composite type, or enum.'

describe('schemaProblems', () => {
  it('counts the errors the language server placed and names the first one with its line', () => {
    expect(
      schemaProblems({
        error: 'error: ...\n\nValidation Error Count: 2',
        diagnostics: [
          {
            path: 'prisma/schema.prisma',
            range: { start: { line: 167, character: 2 }, end: { line: 167, character: 3 } },
            message: 'This line is not a valid field or attribute definition.',
            severity: 'error',
          },
          {
            path: 'prisma/schema.prisma',
            range: { start: { line: 169, character: 5 }, end: { line: 169, character: 9 } },
            message: NOPE,
            severity: 'error',
          },
          {
            path: 'prisma/schema.prisma',
            range: { start: { line: 3, character: 0 }, end: { line: 3, character: 10 } },
            message: '@ignore: ...',
            severity: 'hint',
          },
        ],
      }),
    ).toStrictEqual({
      count: 2,
      summary: 'This line is not a valid field or attribute definition. (prisma/schema.prisma:168)',
    })
  })

  it('counts a failure without diagnostics once and summarises its first line', () => {
    expect(
      schemaProblems({ error: 'Schema not found: /nowhere\n   Pass --schema', diagnostics: [] }),
    ).toStrictEqual({ count: 1, summary: 'Schema not found: /nowhere' })
  })
})
