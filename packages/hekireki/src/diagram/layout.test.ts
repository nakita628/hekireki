import { describe, expect, it } from 'vite-plus/test'

import {
  ENUM_WIDTH,
  GRID,
  NODE_CONSTRAINT_HEIGHT,
  NODE_DESCRIPTION_HEIGHT,
  NODE_HEADER_HEIGHT,
  NODE_PADDING,
  NODE_ROW_HEIGHT,
  NODE_WIDTH,
} from '../constants/index.js'
import type { DiagramField } from '../types/index.js'
import {
  autoLayout,
  diagramConstraints,
  diagramFields,
  enumHeight,
  fieldDetail,
  fieldRowHeight,
  firstLine,
  nodeHeight,
  uniqueColumns,
} from './layout.js'

type Layout = ReturnType<typeof autoLayout>
type Block = {
  readonly name: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Where the layout put a block, which it places every block of. */
function positionOf(positions: Layout, name: string) {
  const position = positions[name]
  if (position === undefined) throw new Error(`${name} is not positioned`)
  return position
}

/** The box each placed block takes, a model or an enum sized as the diagram draws it. */
function blockBoxes(schema: Parameters<typeof autoLayout>[0], positions: Layout): Block[] {
  const models = new Map(schema.models.map((m) => [m.name, m]))
  const enums = new Map((schema.enums ?? []).map((e) => [e.name, e]))
  return Object.entries(positions).map(([name, position]) => {
    const model = models.get(name)
    const value = enums.get(name)
    if (model !== undefined) {
      return { name, x: position.x, y: position.y, width: NODE_WIDTH, height: nodeHeight(model) }
    }
    const height = value === undefined ? 0 : enumHeight(value)
    return { name, x: position.x, y: position.y, width: ENUM_WIDTH, height }
  })
}

/** Each pair of blocks that overlap, both ways round. */
function overlappingPairs(boxes: readonly Block[]) {
  return boxes.flatMap((a) =>
    boxes
      .filter(
        (b) =>
          a.name !== b.name &&
          a.x + a.width > b.x &&
          b.x + b.width > a.x &&
          a.y + a.height > b.y &&
          b.y + b.height > a.y,
      )
      .map((b) => `${a.name} and ${b.name}`),
  )
}

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

  it('puts the key first, then what is unique, then the indexes, whatever order they arrive in', () => {
    const indexes = [
      { type: 'normal' as const, fields: ['c'] },
      { type: 'unique' as const, fields: ['a', 'b'] },
      { type: 'id' as const, fields: ['a', 'b'] },
      { type: 'fulltext' as const, fields: ['d'] },
    ]
    expect(diagramConstraints({ indexes })).toStrictEqual([
      { type: 'id', fields: ['a', 'b'] },
      { type: 'unique', fields: ['a', 'b'] },
      { type: 'normal', fields: ['c'] },
      { type: 'fulltext', fields: ['d'] },
    ])
  })

  it('keeps a @@unique on a single column: the row is the attribute, the UK is the column', () => {
    const indexes = [
      { type: 'unique' as const, fields: ['email'] },
      { type: 'unique' as const, fields: ['tenantId', 'email'] },
    ]
    expect(diagramConstraints({ indexes })).toStrictEqual(indexes)
  })
})

describe('uniqueColumns', () => {
  it('covers a field @unique and every column of a @@unique', () => {
    expect(
      uniqueColumns({
        fields: [{ name: 'email', isUnique: true }, { name: 'tenantId' }, { name: 'loginName' }],
        indexes: [{ type: 'unique', fields: ['tenantId', 'loginName'] }],
      }),
    ).toStrictEqual(new Set(['email', 'tenantId', 'loginName']))
  })

  it('takes no column from an index that is not unique', () => {
    expect(
      uniqueColumns({
        fields: [{ name: 'a' }],
        indexes: [
          { type: 'normal', fields: ['a'] },
          { type: 'id', fields: ['a'] },
        ],
      }),
    ).toStrictEqual(new Set())
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
    const post = positionOf(positions, 'Post')
    const user = positionOf(positions, 'User')
    const role = positionOf(positions, 'Role')
    expect(post.x + NODE_WIDTH).toBeLessThanOrEqual(user.x)
    expect(user.x + NODE_WIDTH).toBeLessThanOrEqual(role.x)
    expect(role.x + ENUM_WIDTH).toBeGreaterThan(role.x)
  })

  it('does not overlap two blocks', () => {
    const positions = autoLayout(schema)
    expect(overlappingPairs(blockBoxes(schema, positions))).toStrictEqual([])
  })

  it('puts every block on the grid', () => {
    for (const position of Object.values(autoLayout(schema))) {
      expect(position.x % GRID).toBe(0)
      expect(position.y % GRID).toBe(0)
    }
  })

  it('lines a rank up on its left edge, so an enum starts where the models beside it do', () => {
    // Post refers to User and holds a Status, so User and Status share the rank after Post.
    const positions = autoLayout({
      models: [
        { name: 'Post', fields: [field({ kind: 'enum', type: 'Status' })] },
        { name: 'User', fields: [field()] },
      ],
      relations: [{ from: { model: 'Post' }, to: { model: 'User' } }],
      enums: [{ name: 'Status', values: ['DRAFT', 'PUBLISHED'] }],
    })
    expect(positions['Status']?.x).toBe(positions['User']?.x)
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
