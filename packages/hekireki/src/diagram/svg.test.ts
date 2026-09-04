import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vite-plus/test'

import { NODE_HEADER_HEIGHT, NODE_PADDING, NODE_ROW_HEIGHT, NODE_WIDTH } from './layout.js'
import {
  diagramBounds,
  diagramPalette,
  edgeCaption,
  fieldTypeLabel,
  renderDiagramSvg,
  smoothStepPath,
  truncateLabel,
} from './svg.js'

type Field = {
  readonly name: string
  readonly kind: 'scalar' | 'object' | 'enum' | 'unsupported'
  readonly type: string
  readonly isList: boolean
  readonly isRequired: boolean
  readonly isId: boolean
  readonly isUnique?: boolean
  readonly isForeignKey: boolean
  readonly documentation: string | null
  readonly attributes?: readonly string[]
}

type Index = {
  readonly type: 'id' | 'normal' | 'unique' | 'fulltext'
  readonly fields: readonly string[]
}

type Model = {
  readonly name: string
  readonly dbName: string | null
  readonly documentation?: string | null
  readonly primaryKey: readonly string[] | null
  readonly fields: readonly Field[]
  readonly indexes?: readonly Index[]
}

type Cardinality = 'zero-one' | 'one' | 'zero-many' | 'many'

type Relation = {
  readonly origin: 'inferred' | 'annotated' | 'implicit-many-to-many'
  readonly onDelete: string | null
  readonly onUpdate?: string | null
  readonly name?: string | null
  readonly from: {
    readonly model: string
    readonly field: string
    readonly cardinality: Cardinality
  }
  readonly to: {
    readonly model: string
    readonly field: string
    readonly cardinality: Cardinality
  }
}

function field(name: string, overrides: Partial<Field> = {}): Field {
  return {
    name,
    kind: 'scalar',
    type: 'String',
    isList: false,
    isRequired: true,
    isId: false,
    isForeignKey: false,
    documentation: null,
    ...overrides,
  }
}

function model(name: string, fields: Field[], dbName: string | null = null): Model {
  return { name, dbName, primaryKey: null, fields }
}

function constrained(name: string, fields: Field[], indexes: Index[]): Model {
  return { name, dbName: null, primaryKey: null, fields, indexes }
}

function relation(overrides: Partial<Relation> = {}): Relation {
  return {
    origin: 'inferred',
    from: { model: 'User', field: 'id', cardinality: 'one' },
    to: { model: 'Post', field: 'authorId', cardinality: 'many' },
    onDelete: null,
    ...overrides,
  }
}

const user = model('User', [field('id', { isId: true }), field('email')], 'users')
const post = model('Post', [
  field('id', { isId: true }),
  field('authorId', { isForeignKey: true, documentation: 'Who wrote it\nSecond line' }),
  field('author', { kind: 'object', type: 'User' }),
])
const positions = { User: { x: 0, y: 0 }, Post: { x: 500, y: 40 } }

describe('renderDiagramSvg', () => {
  it('draws one node per model with its scalar fields and one edge per relation', () => {
    const svg = renderDiagramSvg({
      models: [user, post],
      relations: [relation({ onDelete: 'Cascade' })],
      positions,
    })
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg.match(/class="model-node"/gu)).toHaveLength(2)
    expect(svg.match(/class="relation-edge"/gu)).toHaveLength(1)
    expect(svg).toContain(
      '>User<tspan dx="8" font-size="11" font-weight="400" opacity="0.6">users</tspan></text>',
    )
    expect(svg).toContain('>authorId</text>')
    expect(svg).toContain('>Who wrote it</text>')
    expect(svg).not.toContain('>author</text>')
    expect(svg).toContain('>one to many</text>')
    expect(svg).toContain('>on delete cascade</text>')
    expect(svg).toContain('scale(-1 1)')
  })

  it('ends each edge with the IE symbols of that end', () => {
    const svg = renderDiagramSvg({
      models: [user, post],
      relations: [relation({ from: { model: 'User', field: 'id', cardinality: 'zero-one' } })],
      positions,
    })
    // The parent end is mirrored so both feet open towards the model they touch.
    expect(svg).toContain(
      '<g transform="translate(340 55) scale(-1 1)" fill="none" stroke="#9095ab" stroke-width="1.4"><path d="M-6 -6 L-6 6"/><circle cx="-16" cy="0" r="3.2" fill="#ffffff"/></g>',
    )
    expect(svg).toContain(
      '<g transform="translate(500 117)" fill="none" stroke="#9095ab" stroke-width="1.4"><path d="M0 -8 L-12 0 L0 8 M-12 0 L0 0"/><path d="M-15 -6 L-15 6"/></g>',
    )
  })

  // A documented field is taller than its name; the edge still meets the name, not the row centre.
  it('leaves the source field row on the right and enters the target field name on the left', () => {
    const svg = renderDiagramSvg({ models: [user, post], relations: [relation()], positions })
    const sourceY = NODE_HEADER_HEIGHT + NODE_PADDING + NODE_ROW_HEIGHT / 2
    const targetY = 40 + NODE_HEADER_HEIGHT + NODE_PADDING + NODE_ROW_HEIGHT + NODE_ROW_HEIGHT / 2
    expect(svg).toContain(`d="M${NODE_WIDTH} ${sourceY}`)
    expect(svg).toContain(`L500 ${targetY}"`)
  })

  it('joins the headers for implicit many-to-many relations and dashes annotated ones', () => {
    const svg = renderDiagramSvg({
      models: [user, post],
      relations: [
        relation({
          origin: 'implicit-many-to-many',
          from: { model: 'User', field: 'posts', cardinality: 'many' },
          to: { model: 'Post', field: 'users', cardinality: 'many' },
        }),
      ],
      positions,
    })
    expect(svg).toContain(`d="M${NODE_WIDTH} ${NODE_HEADER_HEIGHT / 2}`)
    expect(svg).toContain('stroke-dasharray="5 4"')
    expect(svg).toContain('>many to many</text>')
  })

  it('escapes markup in names and documentation', () => {
    const svg = renderDiagramSvg({
      models: [model('A<B', [field('x', { documentation: 'a & "b"' })])],
      relations: [],
      positions: { 'A<B': { x: 0, y: 0 } },
    })
    expect(svg).toContain('A&lt;B')
    expect(svg).toContain('a &amp; &quot;b&quot;')
    expect(svg).not.toContain('A<B')
  })

  it('uses the dark palette on request', () => {
    const light = renderDiagramSvg({ models: [user], relations: [], positions })
    const dark = renderDiagramSvg({ models: [user], relations: [], positions, theme: 'dark' })
    expect(light).toContain('fill="#f7f8fb"')
    expect(dark).toContain('fill="#0f1117"')
  })

  it('skips relations whose models are not on the canvas', () => {
    const svg = renderDiagramSvg({ models: [user], relations: [relation()], positions })
    expect(svg).not.toContain('class="relation-edge"')
  })
})

describe('diagramBounds', () => {
  it('wraps every node with the canvas margin', () => {
    expect(diagramBounds([user, post], positions)).toStrictEqual({
      x: -40,
      y: -40,
      width: 500 + NODE_WIDTH + 80,
      height: 40 + NODE_HEADER_HEIGHT + NODE_PADDING * 2 + NODE_ROW_HEIGHT * 2 + 14 + 80,
    })
  })

  it('is the margin alone when there are no models', () => {
    expect(diagramBounds([], {})).toStrictEqual({ x: 0, y: 0, width: 80, height: 80 })
  })
})

describe('smoothStepPath', () => {
  it('bends twice around the midpoint when the target lies to the right', () => {
    const { path, label } = smoothStepPath({ x: 0, y: 0 }, { x: 200, y: 100 })
    expect(path).toBe('M0 0L20 0L 95,0Q 100,0 100,5L 100,95Q 100,100 105,100L180 100L200 100')
    expect(label).toStrictEqual({ x: 100, y: 50 })
  })

  it('routes around both nodes when the target lies to the left', () => {
    const { path } = smoothStepPath({ x: 200, y: 0 }, { x: 0, y: 100 })
    expect(path.startsWith('M200 0L 215,0Q 220,0 220,5')).toBe(true)
    expect(path).toContain('L -15,50Q -20,50 -20,55')
    expect(path.endsWith('Q -20,100 -15,100L0 100')).toBe(true)
  })
})

describe('edgeCaption', () => {
  // Every edge says what it is, whatever else it has to say.
  it('spells the relationship out, in the words it is spoken with', () => {
    expect(edgeCaption(relation())).toStrictEqual(['one to many'])
    expect(
      edgeCaption(relation({ to: { model: 'Post', field: 'authorId', cardinality: 'zero-one' } })),
    ).toStrictEqual(['one to one'])
    expect(
      edgeCaption(
        relation({
          origin: 'implicit-many-to-many',
          from: { model: 'User', field: 'posts', cardinality: 'zero-many' },
        }),
      ),
    ).toStrictEqual(['many to many'])
  })

  it('puts what happens to a row on a second line', () => {
    expect(edgeCaption(relation({ onDelete: 'SetNull' }))).toStrictEqual([
      'one to many',
      'on delete set null',
    ])
    expect(edgeCaption(relation({ onDelete: 'Cascade', onUpdate: 'Restrict' }))).toStrictEqual([
      'one to many',
      'on delete cascade \u00B7 on update restrict',
    ])
  })

  // Two relations between the same pair only differ by their name, so the name leads the caption.
  it('leads with the name the schema gave the relation, and skips the one Prisma made up', () => {
    expect(edgeCaption(relation({ name: 'follower', onDelete: 'Cascade' }))).toStrictEqual([
      'follower \u00B7 one to many',
      'on delete cascade',
    ])
    expect(edgeCaption(relation({ name: 'PostToUser' }))).toStrictEqual(['one to many'])
  })
})
describe('labels', () => {
  it('spells the type the way the node does', () => {
    expect(fieldTypeLabel(field('a'))).toBe('String')
    expect(fieldTypeLabel(field('a', { isRequired: false }))).toBe('String?')
    expect(fieldTypeLabel(field('a', { isList: true, isRequired: false }))).toBe('String[]')
  })

  it('truncates with an ellipsis at the available width', () => {
    expect(truncateLabel('createdAt', 100, 7.2)).toBe('createdAt')
    expect(truncateLabel('averyveryverylongname', 72, 7.2)).toBe('averyvery…')
    expect(truncateLabel('ab', 5, 7.2)).toBe('…')
  })
})

/** The label chips of a rendered diagram, as boxes. */
function captionBoxes(svg: string) {
  return [
    ...svg.matchAll(
      /<g class="relation-label"><rect x="(\S+?)" y="(\S+?)" width="(\S+?)" height="(\S+?)"/gu,
    ),
  ].map(([, x, y, width, height]) => ({
    x: Number(x),
    y: Number(y),
    width: Number(width),
    height: Number(height),
  }))
}

function viewBox(svg: string) {
  const [x, y, width, height] = (/viewBox="([^"]+)"/u.exec(svg)?.[1] ?? '').split(' ').map(Number)
  return { x: x ?? 0, y: y ?? 0, width: width ?? 0, height: height ?? 0 }
}

describe('edge captions', () => {
  it('keeps the caption clear of the models it runs between', () => {
    // Order sits directly between User and Post, over the middle of the edge.
    const between = model('Order', [field('id', { isId: true })])
    const svg = renderDiagramSvg({
      models: [user, post, between],
      relations: [relation({ onDelete: 'Cascade' })],
      positions: { ...positions, Order: { x: 380, y: 0 } },
    })
    const boxes = captionBoxes(svg)
    expect(boxes).toHaveLength(1)
    const [box] = boxes
    expect(box && box.x > 380 && box.x < 720).toBe(false)
  })

  it('draws the captions after the models, so a label is never hidden behind one', () => {
    const svg = renderDiagramSvg({
      models: [user, post],
      relations: [relation({ onDelete: 'Cascade' })],
      positions,
    })
    expect(svg.lastIndexOf('class="model-node"')).toBeLessThan(
      svg.indexOf('class="relation-label"'),
    )
  })
})

describe('self relations', () => {
  const category = model('Category', [
    field('id', { isId: true }),
    field('parentId', { isForeignKey: true, isRequired: false }),
  ])
  const selfRelation = relation({
    from: { model: 'Category', field: 'id', cardinality: 'zero-one' },
    to: { model: 'Category', field: 'parentId', cardinality: 'zero-many' },
  })

  it('loops off the right of the model instead of running around the canvas', () => {
    const svg = renderDiagramSvg({
      models: [category],
      relations: [selfRelation],
      positions: { Category: { x: 0, y: 0 } },
    })
    const sourceY = NODE_HEADER_HEIGHT + NODE_PADDING + NODE_ROW_HEIGHT / 2
    expect(svg).toContain(`d="M${NODE_WIDTH} ${sourceY}`)
    expect(svg).toContain(`L${NODE_WIDTH} ${sourceY + NODE_ROW_HEIGHT}"`)
    // Both ends touch the right-hand side, so both symbols are mirrored.
    expect(svg.match(/scale\(-1 1\)/gu)).toHaveLength(2)
  })

  it('leaves room for the loop in the drawing', () => {
    const svg = renderDiagramSvg({
      models: [category],
      relations: [selfRelation],
      positions: { Category: { x: 0, y: 0 } },
    })
    const box = viewBox(svg)
    expect(box.x + box.width).toBeGreaterThan(NODE_WIDTH + 34)
  })

  it('pulls apart two ends that would land on the same row', () => {
    const svg = renderDiagramSvg({
      models: [model('User', [field('id', { isId: true })])],
      relations: [
        relation({
          origin: 'implicit-many-to-many',
          from: { model: 'User', field: 'friends', cardinality: 'zero-many' },
          to: { model: 'User', field: 'friendOf', cardinality: 'zero-many' },
        }),
      ],
      positions: { User: { x: 0, y: 0 } },
    })
    expect(svg).toContain(`d="M${NODE_WIDTH} ${NODE_HEADER_HEIGHT / 2}`)
    expect(svg).toContain(`L${NODE_WIDTH} ${NODE_HEADER_HEIGHT / 2 + NODE_ROW_HEIGHT}"`)
  })
})

describe('constraints', () => {
  const follow = constrained(
    'Follow',
    [field('followerId', { isForeignKey: true }), field('followingId', { isForeignKey: true })],
    [
      { type: 'id', fields: ['followerId', 'followingId'] },
      { type: 'unique', fields: ['followerId'] },
      { type: 'normal', fields: ['followingId'] },
    ],
  )

  it('lists every block attribute under the fields, named and with its columns', () => {
    const svg = renderDiagramSvg({
      models: [follow],
      relations: [],
      positions: { Follow: { x: 0, y: 0 } },
    })
    expect(svg).toContain('>KEY</text>')
    expect(svg).toContain('>UNIQUE</text>')
    expect(svg).toContain('>INDEX</text>')
    expect(svg).toContain('>followerId, followingId</text>')
  })

  it('makes room for them in the card', () => {
    const plain = renderDiagramSvg({
      models: [model('Follow', [...follow.fields])],
      relations: [],
      positions: { Follow: { x: 0, y: 0 } },
    })
    const withConstraints = renderDiagramSvg({
      models: [follow],
      relations: [],
      positions: { Follow: { x: 0, y: 0 } },
    })
    // Three constraint rows and the padding above them.
    expect(viewBox(withConstraints).height - viewBox(plain).height).toBe(68)
  })

  it('marks a unique field, but not one that is already the key', () => {
    const svg = renderDiagramSvg({
      models: [
        model('User', [
          field('id', { isId: true, isUnique: true }),
          field('email', { isUnique: true }),
        ]),
      ],
      relations: [],
      positions: { User: { x: 0, y: 0 } },
    })
    expect(svg.match(/>UK</gu)).toHaveLength(1)
  })

  it('leaves the unique mark out of the key when nothing carries one', () => {
    const svg = renderDiagramSvg({
      models: [model('User', [field('id', { isId: true })])],
      relations: [],
      positions: { User: { x: 0, y: 0 } },
    })
    expect(svg).not.toContain('>UK<')
  })
})

describe('what a field carries besides its type', () => {
  it('writes the attributes the drawing does not show, then the doc comment', () => {
    const svg = renderDiagramSvg({
      models: [
        model('Profile', [
          field('nickname', {
            attributes: ['@default("anonymous")', '@db.VarChar(64)'],
            documentation: 'What they go by',
          }),
          field('createdAt', { attributes: ['@default(now())', '@map("created_at")'] }),
        ]),
      ],
      relations: [],
      positions: { Profile: { x: 0, y: 0 } },
    })
    expect(svg).toContain(
      '>@default(&quot;anonymous&quot;) @db.VarChar(64) · What they go by</text>',
    )
    expect(svg).toContain('>@default(now())</text>')
    // @map is the column name, which the header already shows.
    expect(svg).not.toContain('created_at')
  })

  it('gives the row a second line only when there is something to put on it', () => {
    const bare = renderDiagramSvg({
      models: [model('A', [field('x')])],
      relations: [],
      positions: { A: { x: 0, y: 0 } },
    })
    const detailed = renderDiagramSvg({
      models: [model('A', [field('x', { attributes: ['@updatedAt'] })])],
      relations: [],
      positions: { A: { x: 0, y: 0 } },
    })
    expect(viewBox(detailed).height - viewBox(bare).height).toBe(14)
  })
})

describe('enums', () => {
  const role = {
    name: 'Role',
    dbName: null,
    documentation: 'Who someone is',
    values: [
      { name: 'ADMIN', dbName: null },
      { name: 'VIEWER', dbName: 'viewer' },
    ],
  }
  const withRole = model('User', [
    field('id', { isId: true }),
    field('role', { kind: 'enum', type: 'Role' }),
  ])
  const drawn = renderDiagramSvg({
    models: [withRole],
    relations: [],
    enums: [role],
    positions: { User: { x: 0, y: 0 }, Role: { x: 500, y: 0 } },
  })

  it('draws a card per enum, with its members and the values the database stores', () => {
    expect(drawn.match(/class="enum-node"/gu)).toHaveLength(1)
    expect(drawn).toContain('>enum</text>')
    expect(drawn).toContain('>ADMIN</text>')
    expect(drawn).toContain('>VIEWER</text>')
    expect(drawn).toContain('>viewer</text>')
  })

  it('links the field that holds one to its card', () => {
    expect(drawn.match(/class="enum-edge"/gu)).toHaveLength(1)
    expect(drawn).toContain('stroke-dasharray="2 4"')
  })

  it('leaves a field whose enum is not on the canvas alone', () => {
    const svg = renderDiagramSvg({
      models: [withRole],
      relations: [],
      positions: { User: { x: 0, y: 0 } },
    })
    expect(svg).not.toContain('class="enum-edge"')
  })
})

// The stylesheet is the palette; this table copies it so a downloaded drawing looks like the page
// it came from. Every entry is checked, because the ones that drifted last time (the card marks)
// were the ones nobody was looking at.
describe('the palette the export paints with', () => {
  const NAMES = {
    canvas: 'canvas',
    surface: 'surface',
    ink: 'ink',
    muted: 'muted',
    faint: 'faint',
    lineStrong: 'line-strong',
    accent: 'accent',
    node: 'node',
    nodeText: 'node-text',
    edge: 'edge',
    dots: 'dots',
    key: 'key',
    unique: 'unique',
    enumeration: 'enum',
  } as const

  /** The `--c-*` values of one block of studio/client/styles.css. */
  function tokensOf(theme: 'light' | 'dark') {
    const css = readFileSync(
      new URL('../studio/client/styles.css', import.meta.url).pathname,
      'utf8',
    )
    const start = css.indexOf(theme === 'light' ? ':root {' : '.dark {')
    const block = css.slice(start, css.indexOf('}', start))
    return Object.fromEntries(
      [...block.matchAll(/--c-([a-z0-9-]+):\s*(#[0-9a-f]+)/gu)].map((m) => [m[1], m[2]]),
    )
  }

  it.each(['light', 'dark'] as const)('matches the stylesheet in %s', (theme) => {
    const tokens = tokensOf(theme)
    const palette = diagramPalette(theme)
    expect(
      Object.keys(NAMES).map((key) => [key, palette[key as keyof typeof NAMES]]),
    ).toStrictEqual(Object.entries(NAMES).map(([key, token]) => [key, tokens[token]]))
  })
})
