import { describe, expect, it } from 'vite-plus/test'

import {
  autoLayout,
  diagramConstraints,
  diagramFields,
  ENUM_WIDTH,
  enumHeight,
  fieldDetail,
  fieldRowHeight,
  firstLine,
  NODE_CONSTRAINT_HEIGHT,
  NODE_DESCRIPTION_HEIGHT,
  NODE_HEADER_HEIGHT,
  NODE_PADDING,
  NODE_ROW_HEIGHT,
  NODE_WIDTH,
  nodeHeight,
} from './layout.js'
import type { DiagramField } from './layout.js'

function field(overrides: Partial<DiagramField> = {}): DiagramField {
  return { kind: 'scalar', type: 'String', documentation: null, ...overrides }
}

describe('firstLine', () => {
  it('keeps the first line, trimmed', () => {
    expect(firstLine('  A user\nMore prose  ')).toBe('A user')
  })

  it('is empty for null, undefined and blank text', () => {
    expect(firstLine(null)).toBe('')
    expect(firstLine(undefined)).toBe('')
    expect(firstLine('   ')).toBe('')
  })
})

describe('diagramFields', () => {
  it('drops the relation fields and keeps everything else in order', () => {
    const fields = [
      field({ kind: 'scalar' }),
      field({ kind: 'object', type: 'Post' }),
      field({ kind: 'enum', type: 'Role' }),
    ]
    expect(diagramFields({ fields })).toStrictEqual([fields[0], fields[2]])
  })
})

describe('fieldDetail', () => {
  it('spells out only the attributes the drawing does not show another way', () => {
    expect(
      fieldDetail(
        field({
          attributes: [
            '@id',
            '@unique',
            '@map("user_id")',
            '@default(now())',
            '@updatedAt',
            '@db.Text',
          ],
        }),
      ),
    ).toBe('@default(now()) @updatedAt @db.Text')
  })

  it('joins the notes and the first line of the doc comment', () => {
    expect(
      fieldDetail(field({ attributes: ['@default(true)'], documentation: 'Active\nlong text' })),
    ).toBe('@default(true) · Active')
  })

  it('is empty for a plain field', () => {
    expect(fieldDetail(field())).toBe('')
    expect(
      fieldDetail(field({ attributes: ['@id', '@relation(fields: [a], references: [b])'] })),
    ).toBe('')
  })
})

describe('fieldRowHeight', () => {
  it('adds a description line only when there is a detail to show', () => {
    expect(fieldRowHeight(field())).toBe(NODE_ROW_HEIGHT)
    expect(fieldRowHeight(field({ documentation: 'doc' }))).toBe(
      NODE_ROW_HEIGHT + NODE_DESCRIPTION_HEIGHT,
    )
  })
})

describe('diagramConstraints', () => {
  it('returns the indexes, or nothing when the model has none', () => {
    const indexes = [{ type: 'unique' as const, fields: ['a', 'b'] }]
    expect(diagramConstraints({ indexes })).toStrictEqual(indexes)
    expect(diagramConstraints({})).toStrictEqual([])
  })
})

describe('nodeHeight', () => {
  it('sums the header, the field rows and the padding', () => {
    const model = { fields: [field(), field({ documentation: 'doc' }), field({ kind: 'object' })] }
    expect(nodeHeight(model)).toBe(
      NODE_HEADER_HEIGHT +
        NODE_PADDING +
        NODE_ROW_HEIGHT +
        (NODE_ROW_HEIGHT + NODE_DESCRIPTION_HEIGHT) +
        NODE_PADDING,
    )
  })

  it('adds a block for the constraints when the model has any', () => {
    const bare = { fields: [field()] }
    const indexed = { ...bare, indexes: [{ type: 'id' as const, fields: ['a'] }] }
    expect(nodeHeight(indexed) - nodeHeight(bare)).toBe(NODE_CONSTRAINT_HEIGHT + NODE_PADDING)
  })
})

describe('enumHeight', () => {
  it('is one row per member', () => {
    expect(enumHeight({ name: 'Role', values: ['A', 'B', 'C'] })).toBe(
      NODE_HEADER_HEIGHT + NODE_PADDING + 3 * NODE_ROW_HEIGHT + NODE_PADDING,
    )
  })
})

describe('autoLayout', () => {
  const schema = {
    models: [
      { name: 'User', fields: [field(), field({ kind: 'enum', type: 'Role' })] },
      { name: 'Post', fields: [field()] },
      { name: 'Orphan', fields: [] },
    ],
    relations: [{ from: { model: 'Post' }, to: { model: 'User' } }],
    enums: [{ name: 'Role', values: ['ADMIN', 'VIEWER'] }],
  }

  it('places every model and enum inside the canvas', () => {
    const positions = autoLayout(schema)
    expect(new Set(Object.keys(positions))).toStrictEqual(
      new Set(['Orphan', 'Post', 'Role', 'User']),
    )
    for (const position of Object.values(positions)) {
      expect(position.x).toBeGreaterThanOrEqual(0)
      expect(position.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('lays the relation out left to right: the referencing model, then the referenced one, then its enum', () => {
    const positions = autoLayout(schema)
    const post = positions.Post
    const user = positions.User
    const role = positions.Role
    if (!post || !user || !role) throw new Error('every block is positioned')
    expect(post.x + NODE_WIDTH).toBeLessThanOrEqual(user.x)
    expect(user.x + NODE_WIDTH).toBeLessThanOrEqual(role.x)
    expect(role.x + ENUM_WIDTH).toBeGreaterThan(role.x)
  })

  it('does not overlap two blocks', () => {
    const positions = autoLayout(schema)
    const boxes = Object.entries(positions).map(([name, position]) => {
      const model = schema.models.find((m) => m.name === name)
      const value = schema.enums.find((e) => e.name === name)
      const width = model ? NODE_WIDTH : ENUM_WIDTH
      const height = model ? nodeHeight(model) : value ? enumHeight(value) : 0
      return { name, x: position.x, y: position.y, width, height }
    })
    for (const a of boxes) {
      for (const b of boxes) {
        if (a.name === b.name) continue
        const apart =
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y
        expect(apart, `${a.name} and ${b.name}`).toBe(true)
      }
    }
  })

  it('ignores self relations, unknown models and repeated edges', () => {
    const positions = autoLayout({
      models: [
        { name: 'Node', fields: [field()] },
        { name: 'Leaf', fields: [] },
      ],
      relations: [
        { from: { model: 'Node' }, to: { model: 'Node' } },
        { from: { model: 'Node' }, to: { model: 'Missing' } },
        { from: { model: 'Leaf' }, to: { model: 'Node' } },
        { from: { model: 'Leaf' }, to: { model: 'Node' } },
      ],
    })
    expect(new Set(Object.keys(positions))).toStrictEqual(new Set(['Leaf', 'Node']))
  })

  it('draws no enum edge for an enum type the schema does not declare', () => {
    const positions = autoLayout({
      models: [{ name: 'User', fields: [field({ kind: 'enum', type: 'Unknown' })] }],
      relations: [],
      enums: [],
    })
    expect(Object.keys(positions)).toStrictEqual(['User'])
  })

  it('is deterministic', () => {
    expect(autoLayout(schema)).toStrictEqual(autoLayout(schema))
  })
})
