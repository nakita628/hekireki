import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { dbmlContent, erDiagramPng, erDiagramSvg } from './dbml.js'

function makeField(overrides: Partial<DMMF.Field> & { name: string; type: string }): DMMF.Field {
  return {
    kind: 'scalar',
    isList: false,
    isRequired: true,
    isUnique: false,
    isId: false,
    isReadOnly: false,
    isGenerated: false,
    isUpdatedAt: false,
    hasDefaultValue: false,
    ...overrides,
  }
}

function makeModel(overrides: Partial<DMMF.Model> & { name: string }): DMMF.Model {
  return {
    dbName: null,
    fields: [],
    uniqueFields: [],
    uniqueIndexes: [],
    primaryKey: null,
    isGenerated: false,
    schema: null,
    ...overrides,
  }
}

const datamodel: DMMF.Datamodel = {
  types: [],
  enums: [],
  indexes: [],
  models: [
    makeModel({
      name: 'User',
      dbName: 'users',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'posts',
          type: 'Post',
          kind: 'object',
          isList: true,
          relationName: 'PostToUser',
        }),
      ],
    }),
    makeModel({
      name: 'Post',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'authorId', type: 'Int', isReadOnly: true }),
        makeField({
          name: 'author',
          type: 'User',
          kind: 'object',
          relationName: 'PostToUser',
          relationFromFields: ['authorId'],
          relationToFields: ['id'],
          relationOnDelete: 'Cascade',
        }),
      ],
    }),
  ],
}

describe('dbmlContent', () => {
  it('writes the tables under their database names', () => {
    const dbml = dbmlContent(datamodel, true)
    expect(dbml).toContain('Table users {')
    expect(dbml).toContain('Table Post {')
    expect(dbml).toContain('authorId Int [not null]')
  })
})

describe('erDiagramSvg', () => {
  it('draws both models, the foreign key edge and its delete rule', () => {
    const svg = erDiagramSvg(datamodel)
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg.match(/class="model-node"/gu)).toHaveLength(2)
    expect(svg.match(/class="relation-edge"/gu)).toHaveLength(1)
    expect(svg).toContain('>on delete cascade</text>')
    expect(svg).toContain('>User<tspan')
  })

  it('switches palettes with the theme', () => {
    expect(erDiagramSvg(datamodel, 'light')).toContain('fill="#f7f8fb"')
    expect(erDiagramSvg(datamodel, 'dark')).toContain('fill="#0f1117"')
  })
})

describe('erDiagramPng', () => {
  it('rasterises the diagram at 2x', () => {
    const png = erDiagramPng(datamodel)
    // PNG signature, then the IHDR chunk with the pixel size.
    expect([...png.subarray(0, 8)]).toStrictEqual([137, 80, 78, 71, 13, 10, 26, 10])
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
    const width = view.getUint32(16)
    const height = view.getUint32(20)
    const svg = erDiagramSvg(datamodel)
    const size = /width="(?<w>[\d.]+)" height="(?<h>[\d.]+)"/u.exec(svg)?.groups
    expect(width).toBe(Math.round(Number(size?.w) * 2))
    expect(height).toBe(Math.round(Number(size?.h) * 2))
  })
})
