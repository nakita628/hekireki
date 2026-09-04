import { describe, expect, it } from 'vite-plus/test'

import type { Box, Point } from '../../../../diagram/edge.js'
import { NODE_WIDTH } from '../../../../diagram/layout.js'
import { diagramGeometry } from './geometry.js'
import type { GeometryCard, GeometryEdge } from './geometry.js'
import { loopTargetHandle, sourceHandle, targetHandle } from './graph.js'

const ROW_HEIGHT = 22
const FIRST_ROW = 44
const CARD_HEIGHT = 120

/**
 * A card with one handle per named row, hung the way `ModelNode` hangs them: a source and a loop
 * target on the right of every row, a target on the left.
 */
function card(x: number, y: number, rows: readonly string[]): GeometryCard {
  const rowY = (index: number) => y + FIRST_ROW + index * ROW_HEIGHT
  return {
    box: { x, y, width: NODE_WIDTH, height: CARD_HEIGHT },
    source: new Map(
      rows.map((row, index) => [sourceHandle(row), { x: x + NODE_WIDTH, y: rowY(index) }]),
    ),
    target: new Map([
      ...rows.map((row, index) => [targetHandle(row), { x, y: rowY(index) }] as const),
      ...rows.map(
        (row, index) => [loopTargetHandle(row), { x: x + NODE_WIDTH, y: rowY(index) }] as const,
      ),
    ]),
  }
}

function edge(
  id: string,
  from: readonly [string, string],
  to: readonly [string, string],
  caption: readonly string[] = [],
): GeometryEdge {
  return {
    id,
    source: from[0],
    target: to[0],
    sourceHandle: sourceHandle(from[1]),
    targetHandle: to[0] === from[0] ? loopTargetHandle(to[1]) : targetHandle(to[1]),
    caption,
  }
}

/**
 * Whether any stretch of a wire runs inside a card — what "the relation disappeared behind a
 * model" means. Written out here rather than shared with the router, so a router that agrees
 * with itself about a wrong answer still fails.
 */
function entersCard(points: readonly Point[], box: Box) {
  return points.slice(0, -1).some((a, index) => {
    const b = points[index + 1] ?? a
    const horizontal = a.y === b.y
    const across = horizontal ? a.y : a.x
    const [acrossFrom, acrossTo] = horizontal
      ? [box.y, box.y + box.height]
      : [box.x, box.x + box.width]
    if (across <= acrossFrom || across >= acrossTo) return false
    const [from, to] = horizontal
      ? [Math.min(a.x, b.x), Math.max(a.x, b.x)]
      : [Math.min(a.y, b.y), Math.max(a.y, b.y)]
    const [boxFrom, boxTo] = horizontal ? [box.x, box.x + box.width] : [box.y, box.y + box.height]
    return Math.min(to, boxTo) - Math.max(from, boxFrom) > 1
  })
}

/** The chip a caption is drawn in, from the point the pass centres it on. */
function captionBoxAt(centre: Point, caption: readonly string[]): Box {
  const width = Math.max(...caption.map((line) => line.length * 9.5 * 0.6)) + 10
  const height = caption.length * 12 + 4
  return { x: centre.x - width / 2, y: centre.y - height / 2, width, height }
}

function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** Whether a chip covers any stretch of a wire, which is what hides the relation it names. */
function coversWire(box: Box, points: readonly Point[]) {
  return points.slice(0, -1).some((a, index) => {
    const b = points[index + 1] ?? a
    const wire = {
      x: Math.min(a.x, b.x) - 1,
      y: Math.min(a.y, b.y) - 1,
      width: Math.abs(b.x - a.x) + 2,
      height: Math.abs(b.y - a.y) + 2,
    }
    return overlaps(box, wire)
  })
}

const user = card(0, 0, ['id', 'email'])
const post = card(840, 200, ['id', 'authorId'])
const pair = new Map([
  ['User', user],
  ['Post', post],
])

describe('diagramGeometry', () => {
  it('runs an edge between the two handles its ends name', () => {
    const geometry = diagramGeometry([edge('r', ['User', 'id'], ['Post', 'authorId'])], pair)
    const points = geometry.get('r')?.points ?? []
    expect(points[0]).toStrictEqual({ x: NODE_WIDTH, y: FIRST_ROW })
    expect(points.at(-1)).toStrictEqual({ x: 840, y: 200 + FIRST_ROW + ROW_HEIGHT })
  })

  it('draws the path through the same corners, with the turns rounded', () => {
    const geometry = diagramGeometry([edge('r', ['User', 'id'], ['Post', 'authorId'])], pair)
    const wire = geometry.get('r')
    expect(wire?.path.startsWith(`M${NODE_WIDTH} ${FIRST_ROW}`)).toBe(true)
    expect(wire?.path).toContain('Q')
  })

  it('keeps an edge out of the card standing between its ends', () => {
    const between = card(420, 0, ['id'])
    const geometry = diagramGeometry(
      [edge('r', ['User', 'id'], ['Post', 'authorId'])],
      new Map([...pair, ['Between', between]]),
    )
    expect(entersCard(geometry.get('r')?.points ?? [], between.box)).toBe(false)
  })

  it('loops a self relation off the right of its own card', () => {
    const geometry = diagramGeometry(
      [edge('self', ['Category', 'parentId'], ['Category', 'id'])],
      new Map([['Category', card(0, 0, ['id', 'parentId'])]]),
    )
    const points = geometry.get('self')?.points ?? []
    expect(points.every((point) => point.x >= NODE_WIDTH)).toBe(true)
    expect(Math.max(...points.map((point) => point.x))).toBeGreaterThan(NODE_WIDTH)
  })

  // The bug this pass exists for: the caption used to be centred on the loop, and the loop of two
  // neighbouring rows is short enough that the chip hid all of it.
  it('keeps the caption of a self relation off the loop, however short the loop', () => {
    const caption = ['CategoryTree · one to many']
    const geometry = diagramGeometry(
      [edge('self', ['Category', 'parentId'], ['Category', 'id'], caption)],
      new Map([['Category', card(0, 0, ['id', 'parentId'])]]),
    )
    const wire = geometry.get('self')
    expect(wire?.caption).toBeDefined()
    expect(wire?.caption && coversWire(captionBoxAt(wire.caption, caption), wire.points)).toBe(
      false,
    )
  })

  it('keeps a caption off the models', () => {
    const caption = ['one to many', 'on delete cascade']
    const geometry = diagramGeometry(
      [edge('r', ['User', 'id'], ['Post', 'authorId'], caption)],
      pair,
    )
    const centre = geometry.get('r')?.caption
    expect(centre).toBeDefined()
    const box = centre === null || centre === undefined ? null : captionBoxAt(centre, caption)
    expect(box && overlaps(box, user.box)).toBe(false)
    expect(box && overlaps(box, post.box)).toBe(false)
  })

  it('fans the captions of two relations between the same pair apart', () => {
    const geometry = diagramGeometry(
      [
        edge('a', ['User', 'id'], ['Post', 'authorId'], ['one to many']),
        edge('b', ['User', 'email'], ['Post', 'id'], ['one to one']),
      ],
      pair,
    )
    expect(geometry.get('a')?.caption).not.toStrictEqual(geometry.get('b')?.caption)
  })

  it('says nothing about the caption of an edge that carries none', () => {
    const geometry = diagramGeometry([edge('r', ['User', 'id'], ['Post', 'authorId'])], pair)
    expect(geometry.get('r')?.caption).toBeNull()
  })

  it('leaves out an edge whose ends are not both measured', () => {
    expect(diagramGeometry([edge('r', ['User', 'id'], ['Ghost', 'id'])], pair).size).toBe(0)
    expect(
      diagramGeometry(
        [{ ...edge('r', ['User', 'id'], ['Post', 'authorId']), sourceHandle: 'nope' }],
        pair,
      ).size,
    ).toBe(0)
  })

  // An enum link carries no caption of its own, but it is still a wire the other captions have
  // to stay off.
  it('counts a captionless edge as a wire the other captions avoid', () => {
    const caption = ['one to many']
    const withLink = diagramGeometry(
      [
        edge('r', ['User', 'id'], ['Post', 'authorId'], caption),
        edge('link', ['User', 'email'], ['Post', 'id']),
      ],
      pair,
    )
    const centre = withLink.get('r')?.caption
    expect(centre).toBeDefined()
    const box = centre === undefined || centre === null ? null : captionBoxAt(centre, caption)
    expect(box && coversWire(box, withLink.get('link')?.points ?? [])).toBe(false)
  })
})
