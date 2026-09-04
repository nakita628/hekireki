import { describe, expect, it } from 'vite-plus/test'

import { NODE_HEADER_HEIGHT, NODE_PADDING, NODE_ROW_HEIGHT, NODE_WIDTH } from './layout.js'
import {
  diagramBounds,
  edgeLabel,
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
  readonly isForeignKey: boolean
  readonly documentation: string | null
}

type Model = {
  readonly name: string
  readonly dbName: string | null
  readonly primaryKey: readonly string[] | null
  readonly fields: readonly Field[]
}

type Cardinality = 'zero-one' | 'one' | 'zero-many' | 'many'

type Relation = {
  readonly origin: 'inferred' | 'annotated' | 'implicit-many-to-many'
  readonly onDelete: string | null
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
      '<g transform="translate(500 124)" fill="none" stroke="#9095ab" stroke-width="1.4"><path d="M0 -8 L-12 0 L0 8 M-12 0 L0 0"/><path d="M-15 -6 L-15 6"/></g>',
    )
  })

  it('leaves the source field row on the right and enters the target field row on the left', () => {
    const svg = renderDiagramSvg({ models: [user, post], relations: [relation()], positions })
    const sourceY = NODE_HEADER_HEIGHT + NODE_PADDING + NODE_ROW_HEIGHT / 2
    const targetY =
      40 + NODE_HEADER_HEIGHT + NODE_PADDING + NODE_ROW_HEIGHT + (NODE_ROW_HEIGHT + 14) / 2
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

describe('edgeLabel', () => {
  it('names the relation kind or the delete rule', () => {
    expect(edgeLabel(relation())).toBeNull()
    expect(edgeLabel(relation({ onDelete: 'SetNull' }))).toBe('on delete set null')
    expect(edgeLabel(relation({ origin: 'annotated' }))).toBe('@relation')
    expect(edgeLabel(relation({ origin: 'implicit-many-to-many' }))).toBe('many to many')
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
