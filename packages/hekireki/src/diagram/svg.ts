// The ER diagram as one SVG document: the cards (card.ts), the wires between them with the
// crow's-foot symbols at their ends, and the captions on the wires, on the dotted canvas.
import {
  EDGE_LABEL_FONT_SIZE,
  EDGE_LABEL_LINE_HEIGHT,
  EDGE_LABEL_PADDING,
  EDGE_OFFSET,
  GRID,
  NODE_HEADER_HEIGHT,
  PALETTES,
} from '../constants/index.js'
import type { Palette } from '../constants/index.js'
import type {
  Box,
  Cardinality,
  DiagramInput,
  Point,
  Route,
  SchemaRelation,
} from '../types/index.js'
import { around, grow, spanning } from './box.js'
import { edgeCaption } from './caption-text.js'
import { anchorY, hasField, placeEnums, placeNodes, renderEnum, renderNode } from './card.js'
import type { PlacedEnum, PlacedNode } from './card.js'
import { polylinePath, round } from './path.js'
import { BASELINE, escapeXml, FONT_MONO } from './text.js'
import { layoutWires } from './wires.js'

// A relation is drawn solid, and dashed where nothing in the database backs it; an enum link is
// finer, dotted and quieter, so it never reads as a relation.
const EDGE_WIDTH = 1.4
const EDGE_DASH = '5 4'
const ENUM_LINK_WIDTH = 1.2
const ENUM_LINK_DASH = '2 4'
const ENUM_LINK_OPACITY = 0.75
const CAPTION_RADIUS = 3
const CAPTION_BORDER = 0.8

const DOT_RADIUS = 0.7
const PADDING = GRID * 2
// The shadow a card casts on the canvas: a pixel down, a pixel soft, barely there.
const SHADOW = { dy: 1, blur: 1, opacity: 0.08 }
// IE (crow's foot) notation as the canvas draws it (features/schema/schema-view.tsx): the inner
// symbol is the maximum (a bar for one, the foot for many), the outer one the minimum (a bar for
// mandatory, a circle for optional). The origin sits where the edge meets the node, the symbols
// run back along the edge from there.
const CROW_FOOT = 'M0 -8 L-12 0 L0 8 M-12 0 L0 0'
const MAX_ONE_BAR = 'M-6 -6 L-6 6'
const MIN_ONE_BAR = 'M-15 -6 L-15 6'
// The ring for an optional end, centred a pixel past the bar a mandatory one draws.
const MIN_ZERO_CENTER = -16
const MIN_ZERO_RADIUS = 3.2
const CARDINALITY_SYMBOLS = {
  one: { max: MAX_ONE_BAR, optional: false },
  'zero-one': { max: MAX_ONE_BAR, optional: true },
  many: { max: CROW_FOOT, optional: false },
  'zero-many': { max: CROW_FOOT, optional: true },
} as const

/** One end of an edge in IE notation, drawn towards the node the end touches. */
function renderCardinality(
  cardinality: Cardinality,
  point: Point,
  towards: 'left' | 'right',
  palette: Palette,
) {
  const { max, optional } = CARDINALITY_SYMBOLS[cardinality]
  const flip = towards === 'left' ? ' scale(-1 1)' : ''
  const minimum = optional
    ? `<circle cx="${MIN_ZERO_CENTER}" cy="0" r="${MIN_ZERO_RADIUS}" fill="${palette.surface}"/>`
    : `<path d="${MIN_ONE_BAR}"/>`
  return `<g transform="translate(${round(point.x)} ${round(point.y)})${flip}" fill="none" stroke="${palette.edge}" stroke-width="${EDGE_WIDTH}"><path d="${max}"/>${minimum}</g>`
}

type Edge = {
  readonly relation: SchemaRelation
  readonly points: Route
  readonly dashed: boolean
  /** Which way the end symbols face: the target of a self loop sits on the right of its node. */
  readonly targetTowards: 'left' | 'right'
}

/** Where a relation leaves its model and where it comes into the other, or back into its own. */
function edgeEnds(relation: SchemaRelation, nodes: ReadonlyMap<string, PlacedNode>) {
  const from = nodes.get(relation.from.model)
  const to = nodes.get(relation.to.model)
  if (!(from && to)) return null
  // An implicit many-to-many has no column at either end to meet, so both of its ends hang off
  // the card header rather than off a field row — as does any relation naming a field the card
  // does not list.
  const useHeader =
    relation.origin === 'implicit-many-to-many' ||
    !hasField(from, relation.from.field) ||
    !hasField(to, relation.to.field)
  const loops = relation.from.model === relation.to.model
  return {
    relation,
    loops,
    source: { x: from.x + from.width, y: anchorY(from, useHeader ? null : relation.from.field) },
    target: {
      x: loops ? to.x + to.width : to.x,
      y: anchorY(to, useHeader ? null : relation.to.field),
    },
  }
}

function renderEdge(edge: Edge, palette: Palette) {
  const source = edge.points[0]
  const target = edge.points.at(-1)
  if (!(source && target)) return ''
  return [
    `<g class="relation-edge">`,
    `<path d="${polylinePath(edge.points)}" fill="none" stroke="${palette.edge}" stroke-width="${EDGE_WIDTH}"${edge.dashed ? ` stroke-dasharray="${EDGE_DASH}"` : ''}/>`,
    renderCardinality(edge.relation.from.cardinality, source, 'left', palette),
    renderCardinality(edge.relation.to.cardinality, target, edge.targetTowards, palette),
    `</g>`,
  ].join('')
}

/** Where the dotted link from every enum-typed field to the card that lists its values runs. */
function enumLinkEnds(nodes: readonly PlacedNode[], enums: readonly PlacedEnum[]) {
  return nodes.flatMap((node) =>
    node.fields.flatMap((field) => {
      const card = enums.find((candidate) => candidate.value.name === field.type)
      if (field.kind !== 'enum' || card === undefined) return []
      return [
        {
          source: { x: node.x + node.width, y: anchorY(node, field.name) },
          target: { x: card.x, y: card.y + NODE_HEADER_HEIGHT / 2 },
          loops: false,
          caption: [],
        },
      ]
    }),
  )
}

function renderEnumLink(points: Route, palette: Palette) {
  return `<g class="enum-edge"><path d="${polylinePath(points)}" fill="none" stroke="${palette.enumeration}" stroke-width="${ENUM_LINK_WIDTH}" stroke-dasharray="${ENUM_LINK_DASH}" opacity="${ENUM_LINK_OPACITY}"/></g>`
}

// The relation leads, in the plain colour; what it does to a row follows in the quiet one.
function renderCaption(caption: readonly string[], box: Box, palette: Palette) {
  const center = box.x + box.width / 2
  const lines = caption.map((line, index) => {
    const baseline =
      box.y +
      EDGE_LABEL_PADDING / 2 +
      (index + 1 / 2) * EDGE_LABEL_LINE_HEIGHT +
      EDGE_LABEL_FONT_SIZE * BASELINE
    return `<text x="${round(center)}" y="${round(baseline)}" font-family="${FONT_MONO}" font-size="${EDGE_LABEL_FONT_SIZE}" text-anchor="middle" fill="${index === 0 ? palette.muted : palette.faint}">${escapeXml(line)}</text>`
  })
  return `<g class="relation-label"><rect x="${round(box.x)}" y="${round(box.y)}" width="${round(box.width)}" height="${round(box.height)}" rx="${CAPTION_RADIUS}" fill="${palette.surface}" stroke="${palette.lineStrong}" stroke-width="${CAPTION_BORDER}"/>${lines.join('')}</g>`
}

/**
 * Draws the ER diagram as Studio shows it: one card per model with its scalar fields, one per
 * enum, and a wire per relation in crow's-foot notation with its caption on it. The result is a
 * standalone SVG document with the canvas behind it.
 */
export function renderDiagramSvg(input: DiagramInput) {
  const palette = PALETTES[input.theme ?? 'light']
  const nodes = placeNodes(input.models, input.positions)
  const enums = placeEnums(input.enums ?? [], input.positions)
  const byName = new Map(nodes.map((node) => [node.model.name, node]))
  const cards = [...nodes, ...enums]
  const relations = input.relations
    .map((relation) => edgeEnds(relation, byName))
    .filter((end) => end !== null)
  // The enum links are laid out with the relations: a dotted wire on top of a solid one reads as
  // neither, and a caption has to stay off both.
  const wired = layoutWires(
    [
      ...relations.map((end) => ({
        source: end.source,
        target: end.target,
        loops: end.loops,
        caption: edgeCaption(end.relation),
      })),
      ...enumLinkEnds(nodes, enums),
    ],
    cards,
  )
  const edges = relations.map(({ relation, loops }, index): Edge => ({
    relation,
    points: wired[index]?.points ?? [],
    // Dashed is "no foreign key backs this", not "many to many" — see `RelationOrigin`.
    dashed: relation.origin === 'annotated' || relation.origin === 'implicit-many-to-many',
    targetTowards: loops ? 'left' : 'right',
  }))
  const links = wired.slice(relations.length).map((laid) => laid.points)
  // The captions are laid out before the drawing is sized, so none of them falls outside it.
  const captions = wired.flatMap(({ wire, caption }) =>
    caption === null ? [] : [{ caption: wire.caption, box: caption }],
  )
  // The end symbols reach back along the edge, so a corner of a wire takes a stub's room around it.
  const ends = [...edges.map((edge) => edge.points), ...links].flatMap((points) =>
    points.map((point) => grow(spanning(point), EDGE_OFFSET)),
  )
  const content = around(
    [
      ...(cards.length === 0 ? [spanning({ x: 0, y: 0 })] : cards),
      ...ends,
      ...captions.map((caption) => caption.box),
    ],
    PADDING,
  )
  // The canvas starts and ends on the grid, as every block on it does.
  const left = Math.floor(content.x / GRID) * GRID
  const top = Math.floor(content.y / GRID) * GRID
  const bounds = {
    x: left,
    y: top,
    width: Math.ceil((content.x + content.width) / GRID) * GRID - left,
    height: Math.ceil((content.y + content.height) / GRID) * GRID - top,
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${round(bounds.width)}" height="${round(bounds.height)}" viewBox="${round(bounds.x)} ${round(bounds.y)} ${round(bounds.width)} ${round(bounds.height)}">`,
    `<defs>`,
    `<pattern id="dots" x="${-DOT_RADIUS}" y="${-DOT_RADIUS}" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse"><circle cx="${DOT_RADIUS}" cy="${DOT_RADIUS}" r="${DOT_RADIUS}" fill="${palette.dots}"/></pattern>`,
    `<filter id="node-shadow" x="-5%" y="-5%" width="110%" height="115%"><feDropShadow dx="0" dy="${SHADOW.dy}" stdDeviation="${SHADOW.blur}" flood-color="#000000" flood-opacity="${SHADOW.opacity}"/></filter>`,
    `</defs>`,
    `<rect x="${round(bounds.x)}" y="${round(bounds.y)}" width="${round(bounds.width)}" height="${round(bounds.height)}" fill="${palette.canvas}"/>`,
    `<rect x="${round(bounds.x)}" y="${round(bounds.y)}" width="${round(bounds.width)}" height="${round(bounds.height)}" fill="url(#dots)"/>`,
    ...links.map((points) => renderEnumLink(points, palette)),
    ...edges.map((edge) => renderEdge(edge, palette)),
    ...nodes.map((node, index) => renderNode(node, index, palette)),
    ...enums.map((card, index) => renderEnum(card, index, palette)),
    // The captions go on top of the models: a label is worth more than the pixels it covers.
    ...captions.map((caption) => renderCaption(caption.caption, caption.box, palette)),
    `</svg>`,
  ]
    .filter((line) => line !== '')
    .join('\n')
}
