import { describe, expect, it } from 'vite-plus/test'
import { parse } from 'yaml'

import type { YamlValue } from './yaml.js'
import { toYaml } from './yaml.js'

describe('toYaml', () => {
  it('writes nested maps and lists in block style, two spaces a level', () => {
    const text = toYaml({
      openapi: '3.1.0',
      info: { title: 'Generated from schema.prisma', version: '1.0.0' },
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              id: { type: 'integer', format: 'int32' },
              name: { type: ['string', 'null'] },
              active: { type: 'boolean', default: true },
            },
            required: ['id'],
          },
        },
      },
    })
    expect(text).toBe(`openapi: 3.1.0
info:
  title: Generated from schema.prisma
  version: 1.0.0
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: integer
          format: int32
        name:
          type:
            - string
            - "null"
        active:
          type: boolean
          default: true
      required:
        - id
`)
  })

  it('writes an empty map and an empty list inline', () => {
    expect(toYaml({ payload: {}, tags: [] })).toBe('payload: {}\ntags: []\n')
  })

  it('writes a string with newlines as a literal block', () => {
    expect(toYaml({ description: 'Application user.\nFully annotated.' })).toBe(
      'description: |-\n  Application user.\n  Fully annotated.\n',
    )
  })

  it('keeps the one newline a string ends with through a clipped block', () => {
    expect(toYaml({ description: 'A user.\n' })).toBe('description: |\n  A user.\n')
    expect(toYaml({ description: 'FK a: (b) -> c\nFK d: (e) -> f\n' })).toBe(
      'description: |\n  FK a: (b) -> c\n  FK d: (e) -> f\n',
    )
  })

  it('writes a list of scalars under a flow key on one line', () => {
    expect(toYaml({ type: ['string', 'null'], required: ['id'] }, { flow: ['type'] })).toBe(
      'type: [string, "null"]\nrequired:\n  - id\n',
    )
  })

  it('keeps a flow key in block style when its list holds a collection', () => {
    expect(toYaml({ type: [{ a: 1 }] }, { flow: ['type'] })).toBe('type:\n  - a: 1\n')
  })

  it('always quotes a string under a quote key, and nothing else under it', () => {
    expect(toYaml({ default: 'pending', other: 'pending' }, { quote: ['default'] })).toBe(
      'default: "pending"\nother: pending\n',
    )
    expect(toYaml({ default: 0, nested: { default: 'a\nb' } }, { quote: ['default'] })).toBe(
      'default: 0\nnested:\n  default: "a\\nb"\n',
    )
  })

  it.each(['3.1.0', '1.0.0', '10.20.30'])('leaves the version %s unquoted', (version) => {
    expect(toYaml({ version })).toBe(`version: ${version}\n`)
    expect(parse(toYaml({ version }))).toStrictEqual({ version })
  })

  it.each([
    ['a word a reader would turn into a boolean', 'yes'],
    ['a word a reader would turn into null', 'null'],
    ['a number', '42'],
    ['a colon followed by a space', 'FK users: (id)'],
    ['a trailing colon', 'note:'],
    ['a hash', 'issue #12'],
    ['a comma', 'one, two'],
    ['an opening bracket', '[draft]'],
    ['a leading dash', '- item'],
    ['a leading quote', '"quoted"'],
    ['trailing whitespace', 'padded '],
    ['a tab', 'a\tb'],
    ['an indented second line', 'first\n  second'],
    ['a carriage return', 'first\r\nsecond'],
    ['two trailing newlines', 'ends\n\n'],
    ['only a newline', '\n'],
    ['nothing', ''],
  ])('quotes a string holding %s', (_what, text) => {
    expect(toYaml({ key: text })).toBe(`key: ${JSON.stringify(text)}\n`)
  })

  it('quotes a key that is not a plain word', () => {
    expect(toYaml({ 'first name': 1, $ref: 2, 'a:b': 3, 'application/json': 4, '/users': 5 })).toBe(
      '"first name": 1\n$ref: 2\n"a:b": 3\napplication/json: 4\n"/users": 5\n',
    )
  })

  it('writes a map inside a list beside its dash', () => {
    expect(toYaml({ allOf: [{ $ref: '#/components/schemas/User' }, { type: 'object' }] })).toBe(
      'allOf:\n  - $ref: "#/components/schemas/User"\n  - type: object\n',
    )
  })

  it.each<[string, YamlValue]>([
    [
      'scalars of every kind',
      { s: 'text', n: 1.5, big: Number.MAX_SAFE_INTEGER, b: false, nil: null },
    ],
    [
      'strings a reader could mistake',
      {
        words: [
          'yes',
          'No',
          'null',
          '~',
          'on',
          '0x1F',
          '1e3',
          '2001-12-14',
          '.inf',
          '1.0',
          '1.0.0',
        ],
        punctuation: ['a: b', 'a #b', '#a', '- a', '? a', ': a', '!a', '&a', '*a', '%a', '@a'],
        edges: ['', ' ', ' a', 'a ', '\n', 'a\n', '\na', 'a\n\nb', 'a\n b', '"', "'", '\\'],
      },
    ],
    ['empty collections', { a: [], b: {}, c: [[], {}], d: { e: [] } }],
    ['lists in lists', { a: [[1, 2], [['x']], [{ k: 'v' }]] }],
    ['a literal block in a list', { a: ['one\ntwo', { k: 'three\nfour' }, 'five\n'] }],
    ['keys that need quotes', { 'a b': 1, '1': 2, true: 3, '': 4, 'a: b': 5, 'a/b': 6, '/a': 7 }],
  ])('round-trips %s through a YAML reader', (_what, value) => {
    expect(parse(toYaml(value))).toStrictEqual(value)
    expect(parse(toYaml(value, { flow: ['words', 'a', 'type'] }))).toStrictEqual(value)
    expect(parse(toYaml(value, { quote: ['s', 'words', 'a', 'k'] }))).toStrictEqual(value)
  })
})
