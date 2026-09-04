import {
  diagramFields,
  fieldRowHeight,
  NODE_HEADER_HEIGHT,
  NODE_PADDING,
  NODE_WIDTH,
  nodeHeight,
} from './layout.js'
import type { LayoutPositions, Position } from './layout.js'

export type DiagramTheme = 'light' | 'dark'

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

// The Studio palette (styles.css), so the export looks like the canvas it came from.
const PALETTES = {
  light: {
    canvas: '#f7f8fb',
    surface: '#ffffff',
    ink: '#16181f',
    muted: '#6b7084',
    faint: '#9a9fb3',
    lineStrong: '#cfd3e0',
    accent: '#4f46e5',
    node: '#1f2233',
    nodeText: '#f4f5fa',
    edge: '#9095ab',
    dots: '#d4d4dc',
    key: '#d97706',
    enumeration: '#7c3aed',
  },
  dark: {
    canvas: '#0f1117',
    surface: '#171a23',
    ink: '#e6e8ef',
    muted: '#9aa0b4',
    faint: '#6b7189',
    lineStrong: '#343a4a',
    accent: '#7c74ff',
    node: '#2a2f45',
    nodeText: '#f4f5fa',
    edge: '#6b7189',
    dots: '#2a2f3d',
    key: '#fbbf24',
    enumeration: '#c4b5fd',
  },
} as const

// Family names stay unquoted: resvg drops a quoted name that follows an unquoted one.
const FONT_MONO =
  'ui-monospace, SF Mono, Menlo, Consolas, Liberation Mono, DejaVu Sans Mono, monospace'
const FONT_SANS =
  'ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, DejaVu Sans, sans-serif'

// Glyph advance as a fraction of the font size; used to right-align, truncate and size labels.
const MONO_ADVANCE = 0.6
const MONO_BOLD_ADVANCE = 0.66
const SANS_ADVANCE = 0.52
const NODE_RADIUS = 8
const HEADER_PADDING_X = 10
const ICON_SIZE = 11
const ROW_GAP = 6
const EDGE_OFFSET = 20
const EDGE_BEND_RADIUS = 5
const EDGE_LABEL_FONT_SIZE = 9.5
const DOT_GAP = 20
const DOT_RADIUS = 0.7
const PADDING = 40

// IE (crow's foot) notation as the canvas draws it (features/schema/schema-view.tsx): the inner
// symbol is the maximum (a bar for one, the foot for many), the outer one the minimum (a bar for
// mandatory, a circle for optional). The origin sits where the edge meets the node, the symbols
// run back along the edge from there.
const CROW_FOOT = 'M0 -8 L-12 0 L0 8 M-12 0 L0 0'
const MAX_ONE_BAR = 'M-6 -6 L-6 6'
const MIN_ONE_BAR = 'M-15 -6 L-15 6'
const CARDINALITY_SYMBOLS = {
  one: { max: MAX_ONE_BAR, optional: false },
  'zero-one': { max: MAX_ONE_BAR, optional: true },
  many: { max: CROW_FOOT, optional: false },
  'zero-many': { max: CROW_FOOT, optional: true },
} as const

// The two field icons of the model node (components/icons.tsx), on a 24-unit grid.
const KEY_ICON =
  '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>'
const LINK_ICON =
  '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'

type Palette = (typeof PALETTES)[DiagramTheme]

type PlacedNode = {
  readonly model: Model
  readonly fields: readonly Field[]
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

type Point = { readonly x: number; readonly y: number }

export type DiagramInput = {
  readonly models: readonly Model[]
  readonly relations: readonly Relation[]
  readonly positions: LayoutPositions
  readonly theme?: DiagramTheme
}

function escapeXml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

function monoWidth(text: string, fontSize: number) {
  return text.length * fontSize * MONO_ADVANCE
}

function sansWidth(text: string, fontSize: number) {
  return text.length * fontSize * SANS_ADVANCE
}

/** Cuts a label to the width it may take, ending it with an ellipsis like `truncate` does. */
export function truncateLabel(text: string, maxWidth: number, advance: number) {
  const capacity = Math.floor(maxWidth / advance)
  if (text.length <= capacity) return text
  return capacity <= 1 ? '…' : `${text.slice(0, capacity - 1)}…`
}

export function fieldTypeLabel(field: Field) {
  return `${field.type}${field.isList ? '[]' : ''}${field.isRequired || field.isList ? '' : '?'}`
}

function firstLine(text: string | null) {
  return text?.split('\n')[0]?.trim() ?? ''
}

function placeNodes(models: readonly Model[], positions: LayoutPositions): readonly PlacedNode[] {
  return models.map((model) => {
    const fields = diagramFields(model)
    const position: Position = positions[model.name] ?? { x: 0, y: 0 }
    return {
      model,
      fields,
      x: position.x,
      y: position.y,
      width: NODE_WIDTH,
      height: nodeHeight(fields),
    }
  })
}

/** The vertical centre of a field row, or of the header when the field is not shown. */
function anchorY(node: PlacedNode, field: string | null) {
  const index = field === null ? -1 : node.fields.findIndex((f) => f.name === field)
  if (index === -1) return node.y + NODE_HEADER_HEIGHT / 2
  const above = node.fields
    .slice(0, index)
    .reduce((sum, current) => sum + fieldRowHeight(current), 0)
  const row = node.fields[index]
  return node.y + NODE_HEADER_HEIGHT + NODE_PADDING + above + (row ? fieldRowHeight(row) : 0) / 2
}

function humanizeAction(action: string) {
  return action
    .replaceAll(/([A-Z])/gu, ' $1')
    .trim()
    .toLowerCase()
}

/** The caption Studio draws on an edge, when it has one. */
export function edgeLabel(relation: Relation) {
  if (relation.origin === 'implicit-many-to-many') return 'many to many'
  if (relation.origin === 'annotated') return '@relation'
  return relation.onDelete === null ? null : `on delete ${humanizeAction(relation.onDelete)}`
}

// A port of React Flow's smoothstep edge for a right-hand source and a left-hand target: the
// edge leaves horizontally, bends once or twice with rounded corners, and enters horizontally.
function bend(a: Point, b: Point, c: Point) {
  const size = Math.min(
    Math.hypot(a.x - b.x, a.y - b.y) / 2,
    Math.hypot(b.x - c.x, b.y - c.y) / 2,
    EDGE_BEND_RADIUS,
  )
  const { x, y } = b
  if ((a.x === x && x === c.x) || (a.y === y && y === c.y)) return `L${round(x)} ${round(y)}`
  if (a.y === y) {
    const xDir = a.x < c.x ? -1 : 1
    const yDir = a.y < c.y ? 1 : -1
    return `L ${round(x + size * xDir)},${round(y)}Q ${round(x)},${round(y)} ${round(x)},${round(y + size * yDir)}`
  }
  const xDir = a.x < c.x ? 1 : -1
  const yDir = a.y < c.y ? -1 : 1
  return `L ${round(x)},${round(y + size * yDir)}Q ${round(x)},${round(y)} ${round(x + size * xDir)},${round(y)}`
}

/** The path of an edge from a source on the right of a node to a target on the left of another, and its label point. */
export function smoothStepPath(source: Point, target: Point) {
  const sourceGapped = { x: source.x + EDGE_OFFSET, y: source.y }
  const targetGapped = { x: target.x - EDGE_OFFSET, y: target.y }
  const center = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 }
  const forward = sourceGapped.x < targetGapped.x
  const split = forward
    ? [
        { x: center.x, y: sourceGapped.y },
        { x: center.x, y: targetGapped.y },
      ]
    : [
        { x: sourceGapped.x, y: center.y },
        { x: targetGapped.x, y: center.y },
      ]
  const points = [source, sourceGapped, ...split, targetGapped, target]
  const path = points
    .map((point, index) => {
      const previous = points[index - 1]
      const next = points[index + 1]
      if (previous && next) return bend(previous, point, next)
      return `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`
    })
    .join('')
  return { path, label: center }
}

function fieldIcon(field: Field, primaryKey: ReadonlySet<string>, palette: Palette) {
  if (field.isId || primaryKey.has(field.name)) return { icon: KEY_ICON, color: palette.key }
  if (field.isForeignKey) return { icon: LINK_ICON, color: palette.accent }
  return null
}

function renderRow(node: PlacedNode, field: Field, top: number, palette: Palette) {
  const primaryKey = new Set(node.model.primaryKey)
  const left = node.x + HEADER_PADDING_X
  const right = node.x + node.width - HEADER_PADDING_X
  const centerY = top + 11
  const icon = fieldIcon(field, primaryKey, palette)
  const type = fieldTypeLabel(field)
  const typeWidth = monoWidth(type, 11)
  const nameLeft = left + ICON_SIZE + ROW_GAP
  const name = truncateLabel(field.name, right - nameLeft - ROW_GAP - typeWidth, 12 * MONO_ADVANCE)
  const description = firstLine(field.documentation)
  const iconSvg = icon
    ? `<g transform="translate(${round(left)} ${round(centerY - ICON_SIZE / 2)}) scale(${round(ICON_SIZE / 24)})" fill="none" stroke="${icon.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon.icon}</g>`
    : ''
  const descriptionSvg = description
    ? `<text x="${round(left + 17)}" y="${round(top + 26 + 10.5 * 0.36)}" font-family="${FONT_SANS}" font-size="10.5" fill="${palette.faint}">${escapeXml(truncateLabel(description, right - left - 17, 10.5 * SANS_ADVANCE))}</text>`
    : ''
  return [
    iconSvg,
    `<text x="${round(nameLeft)}" y="${round(centerY + 12 * 0.36)}" font-family="${FONT_MONO}" font-size="12" fill="${palette.ink}">${escapeXml(name)}</text>`,
    `<text x="${round(right)}" y="${round(centerY + 11 * 0.36)}" font-family="${FONT_MONO}" font-size="11" text-anchor="end" fill="${field.kind === 'enum' ? palette.enumeration : palette.muted}">${escapeXml(type)}</text>`,
    descriptionSvg,
  ].join('')
}

function renderNode(node: PlacedNode, index: number, palette: Palette) {
  const { model, fields } = node
  const clipId = `node-clip-${index}`
  const title = escapeXml(model.name)
  const nameWidth = model.name.length * 13 * MONO_BOLD_ADVANCE
  const pillLabel = `${fields.length} ${fields.length === 1 ? 'field' : 'fields'}`
  const pillWidth = sansWidth(pillLabel, 11) + 16
  const pillX = node.x + node.width - HEADER_PADDING_X - pillWidth
  const dbNameLeft = node.x + HEADER_PADDING_X + nameWidth + 8
  const dbName = model.dbName
    ? truncateLabel(model.dbName, pillX - 8 - dbNameLeft, 11 * MONO_ADVANCE)
    : ''
  const headerCenter = node.y + NODE_HEADER_HEIGHT / 2
  const rows = fields.reduce<{ readonly top: number; readonly svg: readonly string[] }>(
    (state, field) => ({
      top: state.top + fieldRowHeight(field),
      svg: [...state.svg, renderRow(node, field, state.top, palette)],
    }),
    { top: node.y + NODE_HEADER_HEIGHT + NODE_PADDING, svg: [] },
  )
  return [
    `<g class="model-node">`,
    `<clipPath id="${clipId}"><rect x="${round(node.x)}" y="${round(node.y)}" width="${node.width}" height="${round(node.height)}" rx="${NODE_RADIUS}"/></clipPath>`,
    `<rect x="${round(node.x)}" y="${round(node.y)}" width="${node.width}" height="${round(node.height)}" rx="${NODE_RADIUS}" fill="${palette.surface}" stroke="${palette.lineStrong}" filter="url(#node-shadow)"/>`,
    `<rect x="${round(node.x)}" y="${round(node.y)}" width="${node.width}" height="${NODE_HEADER_HEIGHT}" fill="${palette.node}" clip-path="url(#${clipId})"/>`,
    // One text run, so the table name follows the model name at its real width whatever font is used.
    `<text x="${round(node.x + HEADER_PADDING_X)}" y="${round(headerCenter + 13 * 0.36)}" font-family="${FONT_MONO}" font-size="13" font-weight="700" fill="${palette.nodeText}">${title}${
      dbName
        ? `<tspan dx="8" font-size="11" font-weight="400" opacity="0.6">${escapeXml(dbName)}</tspan>`
        : ''
    }</text>`,
    `<rect x="${round(pillX)}" y="${round(headerCenter - 8)}" width="${round(pillWidth)}" height="16" rx="8" fill="${palette.surface}" opacity="0.15"/>`,
    `<text x="${round(pillX + pillWidth / 2)}" y="${round(headerCenter + 11 * 0.36)}" font-family="${FONT_SANS}" font-size="11" text-anchor="middle" fill="${palette.nodeText}">${escapeXml(pillLabel)}</text>`,
    ...rows.svg,
    `</g>`,
  ].join('')
}

function hasField(node: PlacedNode, field: string) {
  return node.fields.some((f) => f.name === field)
}

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
    ? `<circle cx="-16" cy="0" r="3.2" fill="${palette.surface}"/>`
    : `<path d="${MIN_ONE_BAR}"/>`
  return `<g transform="translate(${round(point.x)} ${round(point.y)})${flip}" fill="none" stroke="${palette.edge}" stroke-width="1.4"><path d="${max}"/>${minimum}</g>`
}

function renderEdge(relation: Relation, nodes: ReadonlyMap<string, PlacedNode>, palette: Palette) {
  const from = nodes.get(relation.from.model)
  const to = nodes.get(relation.to.model)
  if (!(from && to)) return ''
  const useHeader =
    relation.origin === 'implicit-many-to-many' ||
    !hasField(from, relation.from.field) ||
    !hasField(to, relation.to.field)
  const source = {
    x: from.x + from.width,
    y: anchorY(from, useHeader ? null : relation.from.field),
  }
  const target = { x: to.x, y: anchorY(to, useHeader ? null : relation.to.field) }
  const { path, label } = smoothStepPath(source, target)
  const dashed = relation.origin === 'annotated' || relation.origin === 'implicit-many-to-many'
  const caption = edgeLabel(relation)
  const captionSvg = caption
    ? (() => {
        const width = monoWidth(caption, EDGE_LABEL_FONT_SIZE) + 8
        const height = EDGE_LABEL_FONT_SIZE + 4
        return `<rect x="${round(label.x - width / 2)}" y="${round(label.y - height / 2)}" width="${round(width)}" height="${round(height)}" rx="2" fill="${palette.surface}"/><text x="${round(label.x)}" y="${round(label.y + EDGE_LABEL_FONT_SIZE * 0.36)}" font-family="${FONT_MONO}" font-size="${EDGE_LABEL_FONT_SIZE}" text-anchor="middle" fill="${palette.muted}">${escapeXml(caption)}</text>`
      })()
    : ''
  return `<g class="relation-edge"><path d="${path}" fill="none" stroke="${palette.edge}" stroke-width="1.4"${dashed ? ' stroke-dasharray="5 4"' : ''}/>${renderCardinality(relation.from.cardinality, source, 'left', palette)}${renderCardinality(relation.to.cardinality, target, 'right', palette)}${captionSvg}</g>`
}

/** The bounding box of the diagram with the canvas margin around it. */
export function diagramBounds(models: readonly Model[], positions: LayoutPositions) {
  const nodes = placeNodes(models, positions)
  if (nodes.length === 0) return { x: 0, y: 0, width: PADDING * 2, height: PADDING * 2 }
  const minX = Math.min(...nodes.map((n) => n.x)) - PADDING
  const minY = Math.min(...nodes.map((n) => n.y)) - PADDING
  const maxX = Math.max(...nodes.map((n) => n.x + n.width)) + PADDING
  const maxY = Math.max(...nodes.map((n) => n.y + n.height)) + PADDING
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Draws the ER diagram as Studio shows it: one node per model with its scalar fields, and a
 * smoothstep edge per relation. The result is a standalone SVG document with the canvas behind it.
 */
export function renderDiagramSvg(input: DiagramInput) {
  const palette = PALETTES[input.theme ?? 'light']
  const nodes = placeNodes(input.models, input.positions)
  const byName = new Map(nodes.map((node) => [node.model.name, node]))
  const bounds = diagramBounds(input.models, input.positions)
  const edges = input.relations.map((relation) => renderEdge(relation, byName, palette))
  const body = nodes.map((node, index) => renderNode(node, index, palette))
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${round(bounds.width)}" height="${round(bounds.height)}" viewBox="${round(bounds.x)} ${round(bounds.y)} ${round(bounds.width)} ${round(bounds.height)}">`,
    `<defs>`,
    `<pattern id="dots" x="${round(bounds.x)}" y="${round(bounds.y)}" width="${DOT_GAP}" height="${DOT_GAP}" patternUnits="userSpaceOnUse"><circle cx="${DOT_RADIUS}" cy="${DOT_RADIUS}" r="${DOT_RADIUS}" fill="${palette.dots}"/></pattern>`,
    `<filter id="node-shadow" x="-5%" y="-5%" width="110%" height="115%"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000000" flood-opacity="0.08"/></filter>`,
    `</defs>`,
    `<rect x="${round(bounds.x)}" y="${round(bounds.y)}" width="${round(bounds.width)}" height="${round(bounds.height)}" fill="${palette.canvas}"/>`,
    `<rect x="${round(bounds.x)}" y="${round(bounds.y)}" width="${round(bounds.width)}" height="${round(bounds.height)}" fill="url(#dots)"/>`,
    ...edges,
    ...body,
    `</svg>`,
  ].join('\n')
}
