import { describe, expect, it } from 'vite-plus/test'

import { completionKindName, symbolKindName, toCompletions, toMarkers } from './lsp.js'

describe('completionKindName', () => {
  it('maps the LSP numbers and falls back to text', () => {
    expect(completionKindName(13)).toBe('Enum')
    expect(completionKindName(14)).toBe('Keyword')
    expect(completionKindName(null)).toBe('Text')
    expect(completionKindName(99)).toBe('Text')
  })
})

describe('symbolKindName', () => {
  it('maps the LSP numbers the Prisma outline uses', () => {
    expect(symbolKindName(5)).toBe('Class')
    expect(symbolKindName(10)).toBe('Enum')
    expect(symbolKindName(11)).toBe('Interface')
    expect(symbolKindName(23)).toBe('Struct')
    expect(symbolKindName(99)).toBe('File')
  })
})

describe('toCompletions', () => {
  it('keeps the server order and marks snippets', () => {
    const items = toCompletions([
      {
        label: '@id',
        kind: 10,
        detail: null,
        documentation: 'Defines a single-field ID',
        insertText: '@id',
        insertTextFormat: 'snippet',
        sortText: null,
      },
      {
        label: '@unique',
        kind: 10,
        detail: null,
        documentation: null,
        insertText: '@unique',
        insertTextFormat: 'plainText',
        sortText: '0002',
      },
    ])
    expect(items.map((i) => [i.label, i.kind, i.sortText, i.isSnippet])).toStrictEqual([
      ['@id', 'Property', '0000', true],
      ['@unique', 'Property', '0002', false],
    ])
    expect(items[0]?.documentation).toBe('Defines a single-field ID')
  })
})

describe('toMarkers', () => {
  it('names the severity and never yields an empty range', () => {
    expect(
      toMarkers([
        {
          range: { start: { line: 1, character: 4 }, end: { line: 1, character: 9 } },
          message: 'bad type',
          severity: 'error',
        },
        {
          range: { start: { line: 3, character: 2 }, end: { line: 3, character: 2 } },
          message: 'unused',
          severity: 'warning',
        },
        {
          range: { start: { line: 5, character: 0 }, end: { line: 5, character: 20 } },
          message: '@ignore',
          severity: 'hint',
        },
      ]),
    ).toStrictEqual([
      {
        range: { start: { line: 1, character: 4 }, end: { line: 1, character: 9 } },
        message: 'bad type',
        severity: 'Error',
      },
      {
        range: { start: { line: 3, character: 2 }, end: { line: 3, character: 3 } },
        message: 'unused',
        severity: 'Warning',
      },
      {
        range: { start: { line: 5, character: 0 }, end: { line: 5, character: 20 } },
        message: '@ignore',
        severity: 'Hint',
      },
    ])
  })
})
