import {
  EDGE_LABEL_FONT_SIZE,
  EDGE_LABEL_LINE_HEIGHT,
  EDGE_LABEL_PADDING,
  placeCaptions,
  polylinePath,
  round,
  selfLoopPoints,
  routePoints,
} from './edge.js'
import type { Box, Point } from './edge.js'
import {
  diagramConstraints,
  diagramFields,
  ENUM_WIDTH,
  enumHeight,
  fieldDetail,
  fieldRowHeight,
  NODE_CONSTRAINT_HEIGHT,
  NODE_HEADER_HEIGHT,
  NODE_PADDING,
  NODE_ROW_HEIGHT,
  NODE_WIDTH,
  nodeHeight,
} from './layout.js'
import type { DiagramIndex, LayoutPositions, Position } from './layout.js'

export { smoothStepPath } from './edge.js'

export type DiagramTheme = 'light' | 'dark'

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

type Model = {
  readonly name: string
  readonly dbName: string | null
  readonly documentation?: string | null
  readonly primaryKey: readonly string[] | null
  readonly fields: readonly Field[]
  readonly indexes?: readonly DiagramIndex[]
}

type EnumBlock = {
  readonly name: string
  readonly dbName: string | null
  readonly documentation?: string | null
  readonly values: readonly { readonly name: string; readonly dbName: string | null }[]
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

// The Studio palette (client/styles.css), value for value, so the export looks like the canvas it
// came from. `key`, `unique` and `enum` are the ones to watch: the canvas reads them from
// `--c-key` / `--c-unique` / `--c-enum`, and a drawing that renders a mark in a different colour
// from the page it was exported from is the failure this table exists to avoid.
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
    key: '#b45309',
    unique: '#0f766e',
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
    unique: '#5eead4',
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
const BADGE_HEIGHT = 12
const BADGE_FONT_SIZE = 8.5
const BADGE_PADDING_X = 4
const CONSTRAINT_FONT_SIZE = 10.5
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

/** The colours a drawing is painted in, which are the Studio palette read back. */
export function diagramPalette(theme: DiagramTheme): Palette {
  return PALETTES[theme]
}

type PlacedNode = {
  readonly model: Model
  readonly fields: readonly Field[]
  readonly constraints: readonly DiagramIndex[]
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

type PlacedEnum = {
  readonly value: EnumBlock
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type DiagramInput = {
  readonly models: readonly Model[]
  readonly relations: readonly Relation[]
  readonly enums?: readonly EnumBlock[]
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

function placeNodes(models: readonly Model[], positions: LayoutPositions): readonly PlacedNode[] {
  return models.map((model) => {
    const position: Position = positions[model.name] ?? { x: 0, y: 0 }
    return {
      model,
      fields: diagramFields(model),
      constraints: diagramConstraints(model),
      x: position.x,
      y: position.y,
      width: NODE_WIDTH,
      height: nodeHeight(model),
    }
  })
}

function placeEnums(
  values: readonly EnumBlock[],
  positions: LayoutPositions,
): readonly PlacedEnum[] {
  return values.map((value) => {
    const position: Position = positions[value.name] ?? { x: 0, y: 0 }
    return {
      value,
      x: position.x,
      y: position.y,
      width: ENUM_WIDTH,
      height: enumHeight(value),
    }
  })
}

/** Where the field rows of a card start. */
function fieldsTop(card: { readonly y: number }) {
  return card.y + NODE_HEADER_HEIGHT + NODE_PADDING
}

/** The vertical centre of a field name, or of the header when the field is not shown. */
function anchorY(node: PlacedNode, field: string | null) {
  const index = field === null ? -1 : node.fields.findIndex((f) => f.name === field)
  if (index === -1) return node.y + NODE_HEADER_HEIGHT / 2
  const above = node.fields
    .slice(0, index)
    .reduce((sum, current) => sum + fieldRowHeight(current), 0)
  return fieldsTop(node) + above + NODE_ROW_HEIGHT / 2
}

function humanizeAction(action: string) {
  return action
    .replaceAll(/([A-Z])/gu, ' $1')
    .trim()
    .toLowerCase()
}

/** Prisma's implicit relation name: both model names sorted and joined with `To`. */
function defaultRelationName(a: string, b: string) {
  return [a, b].toSorted().join('To')
}

/** The `@relation("...")` name, when the schema gave the relation one of its own. */
function customRelationName(relation: Relation) {
  const name = relation.name ?? null
  if (name === null) return null
  return name === defaultRelationName(relation.from.model, relation.to.model) ? null : name
}

/** What the database does to the child rows, as words: `on delete set null`. */
function referentialAction(event: string, action: string | null | undefined) {
  return action === null || action === undefined ? null : `on ${event} ${humanizeAction(action)}`
}

function isMany(cardinality: Cardinality) {
  return cardinality === 'many' || cardinality === 'zero-many'
}

/** The relationship the way it is spoken: one to one, one to many, many to many. */
export function relationshipKind(relation: Relation) {
  const from = isMany(relation.from.cardinality)
  const to = isMany(relation.to.cardinality)
  if (from && to) return 'many to many'
  if (from) return 'many to one'
  return to ? 'one to many' : 'one to one'
}

/**
 * What an edge says about itself, a line at a time: what the relation is — its name, when the
 * schema gave it one, and the relationship it stands for — and then what the database does to a
 * child row when the parent changes.
 */
export function edgeCaption(relation: Relation): readonly string[] {
  const what = [customRelationName(relation), relationshipKind(relation)]
    .filter((part) => part !== null)
    .join(' · ')
  const rules = [
    referentialAction('delete', relation.onDelete),
    referentialAction('update', relation.onUpdate),
  ]
    .filter((part) => part !== null)
    .join(' · ')
  return rules === '' ? [what] : [what, rules]
}

function fieldIcon(field: Field, primaryKey: ReadonlySet<string>, palette: Palette) {
  if (field.isId || primaryKey.has(field.name)) return { icon: KEY_ICON, color: palette.key }
  if (field.isForeignKey) return { icon: LINK_ICON, color: palette.accent }
  return null
}

function renderIcon(icon: string, color: string, x: number, y: number, size: number) {
  return `<g transform="translate(${round(x)} ${round(y)}) scale(${round(size / 24)})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</g>`
}

/** A small rounded chip with a word in it, tinted with the colour of what it marks. */
function renderBadge(label: string, x: number, centerY: number, color: string) {
  const width = sansWidth(label, BADGE_FONT_SIZE) + BADGE_PADDING_X * 2
  const svg = [
    `<rect x="${round(x)}" y="${round(centerY - BADGE_HEIGHT / 2)}" width="${round(width)}" height="${BADGE_HEIGHT}" rx="3" fill="${color}" fill-opacity="0.14"/>`,
    `<text x="${round(x + width / 2)}" y="${round(centerY + BADGE_FONT_SIZE * 0.36)}" font-family="${FONT_SANS}" font-size="${BADGE_FONT_SIZE}" font-weight="600" text-anchor="middle" fill="${color}">${escapeXml(label)}</text>`,
  ].join('')
  return { svg, width }
}

function badgeWidth(label: string) {
  return sansWidth(label, BADGE_FONT_SIZE) + BADGE_PADDING_X * 2
}

/** The constraint a field carries on its own: `@unique`, on a field that is not the key already. */
function uniqueBadge(field: Field, primaryKey: ReadonlySet<string>) {
  return field.isUnique === true && !(field.isId || primaryKey.has(field.name)) ? 'UK' : null
}

function renderRow(node: PlacedNode, field: Field, top: number, palette: Palette) {
  const primaryKey = new Set(node.model.primaryKey)
  const left = node.x + HEADER_PADDING_X
  const right = node.x + node.width - HEADER_PADDING_X
  const centerY = top + NODE_ROW_HEIGHT / 2
  const icon = fieldIcon(field, primaryKey, palette)
  const type = fieldTypeLabel(field)
  const typeWidth = monoWidth(type, 11)
  const badge = uniqueBadge(field, primaryKey)
  const badgeRoom = badge === null ? 0 : badgeWidth(badge) + ROW_GAP
  const badgeSvg =
    badge === null
      ? ''
      : renderBadge(badge, right - typeWidth - ROW_GAP - badgeWidth(badge), centerY, palette.unique)
          .svg
  const nameLeft = left + ICON_SIZE + ROW_GAP
  const name = truncateLabel(
    field.name,
    right - nameLeft - ROW_GAP - typeWidth - badgeRoom,
    12 * MONO_ADVANCE,
  )
  const detail = fieldDetail(field)
  const iconSvg = icon
    ? renderIcon(icon.icon, icon.color, left, centerY - ICON_SIZE / 2, ICON_SIZE)
    : ''
  const detailSvg = detail
    ? `<text x="${round(left + 17)}" y="${round(top + 26 + 10.5 * 0.36)}" font-family="${FONT_SANS}" font-size="10.5" fill="${palette.faint}">${escapeXml(truncateLabel(detail, right - left - 17, 10.5 * SANS_ADVANCE))}</text>`
    : ''
  return [
    iconSvg,
    badgeSvg,
    `<text x="${round(nameLeft)}" y="${round(centerY + 12 * 0.36)}" font-family="${FONT_MONO}" font-size="12" fill="${palette.ink}">${escapeXml(name)}</text>`,
    `<text x="${round(right)}" y="${round(centerY + 11 * 0.36)}" font-family="${FONT_MONO}" font-size="11" text-anchor="end" fill="${field.kind === 'enum' ? palette.enumeration : palette.muted}">${escapeXml(type)}</text>`,
    detailSvg,
  ].join('')
}

// What a block attribute is called in the drawing, and the colour it is tinted with.
const CONSTRAINT_STYLES = {
  id: { label: 'KEY', color: (palette: Palette) => palette.key },
  unique: { label: 'UNIQUE', color: (palette: Palette) => palette.unique },
  normal: { label: 'INDEX', color: (palette: Palette) => palette.muted },
  fulltext: { label: 'FULLTEXT', color: (palette: Palette) => palette.muted },
} as const

/** One `@@id` / `@@unique` / `@@index` of a model: what it is, and the columns it covers. */
function renderConstraint(
  node: PlacedNode,
  constraint: DiagramIndex,
  top: number,
  palette: Palette,
) {
  const style = CONSTRAINT_STYLES[constraint.type]
  const left = node.x + HEADER_PADDING_X
  const right = node.x + node.width - HEADER_PADDING_X
  const centerY = top + NODE_CONSTRAINT_HEIGHT / 2
  const badge = renderBadge(style.label, left, centerY, style.color(palette))
  const columnsLeft = left + badge.width + ROW_GAP
  const columns = truncateLabel(
    constraint.fields.join(', '),
    right - columnsLeft,
    CONSTRAINT_FONT_SIZE * MONO_ADVANCE,
  )
  return `${badge.svg}<text x="${round(columnsLeft)}" y="${round(centerY + CONSTRAINT_FONT_SIZE * 0.36)}" font-family="${FONT_MONO}" font-size="${CONSTRAINT_FONT_SIZE}" fill="${palette.muted}">${escapeXml(columns)}</text>`
}

/** The card behind a block: the rounded surface, its dark header band and the header text. */
function renderCard(
  card: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  id: string,
  header: { readonly name: string; readonly dbName: string | null; readonly pill: string | null },
  palette: Palette,
) {
  const nameWidth = header.name.length * 13 * MONO_BOLD_ADVANCE
  const pillWidth = header.pill === null ? 0 : sansWidth(header.pill, 11) + 16
  const pillX = card.x + card.width - HEADER_PADDING_X - pillWidth
  const dbNameLeft = card.x + HEADER_PADDING_X + nameWidth + 8
  const dbName = header.dbName
    ? truncateLabel(header.dbName, pillX - 8 - dbNameLeft, 11 * MONO_ADVANCE)
    : ''
  const headerCenter = card.y + NODE_HEADER_HEIGHT / 2
  return [
    `<clipPath id="${id}"><rect x="${round(card.x)}" y="${round(card.y)}" width="${round(card.width)}" height="${round(card.height)}" rx="${NODE_RADIUS}"/></clipPath>`,
    `<rect x="${round(card.x)}" y="${round(card.y)}" width="${round(card.width)}" height="${round(card.height)}" rx="${NODE_RADIUS}" fill="${palette.surface}" stroke="${palette.lineStrong}" filter="url(#node-shadow)"/>`,
    `<rect x="${round(card.x)}" y="${round(card.y)}" width="${round(card.width)}" height="${NODE_HEADER_HEIGHT}" fill="${palette.node}" clip-path="url(#${id})"/>`,
    // One text run, so the table name follows the model name at its real width whatever font is used.
    `<text x="${round(card.x + HEADER_PADDING_X)}" y="${round(headerCenter + 13 * 0.36)}" font-family="${FONT_MONO}" font-size="13" font-weight="700" fill="${palette.nodeText}">${escapeXml(header.name)}${
      dbName
        ? `<tspan dx="8" font-size="11" font-weight="400" opacity="0.6">${escapeXml(dbName)}</tspan>`
        : ''
    }</text>`,
    ...(header.pill === null
      ? []
      : [
          `<rect x="${round(pillX)}" y="${round(headerCenter - 8)}" width="${round(pillWidth)}" height="16" rx="8" fill="${palette.surface}" opacity="0.15"/>`,
          `<text x="${round(pillX + pillWidth / 2)}" y="${round(headerCenter + 11 * 0.36)}" font-family="${FONT_SANS}" font-size="11" text-anchor="middle" fill="${palette.nodeText}">${escapeXml(header.pill)}</text>`,
        ]),
  ].join('')
}

function renderNode(node: PlacedNode, index: number, palette: Palette) {
  const { model, fields } = node
  const rows = fields.reduce<{ readonly top: number; readonly svg: readonly string[] }>(
    (state, field) => ({
      top: state.top + fieldRowHeight(field),
      svg: [...state.svg, renderRow(node, field, state.top, palette)],
    }),
    { top: fieldsTop(node), svg: [] },
  )
  return [
    `<g class="model-node">`,
    renderCard(
      node,
      `node-clip-${index}`,
      { name: model.name, dbName: model.dbName, pill: null },
      palette,
    ),
    ...rows.svg,
    ...(node.constraints.length === 0
      ? []
      : [
          `<path d="M${round(node.x)} ${round(rows.top + NODE_PADDING)}H${round(node.x + node.width)}" stroke="${palette.lineStrong}" stroke-width="1"/>`,
          ...node.constraints.map((constraint, position) =>
            renderConstraint(
              node,
              constraint,
              rows.top + NODE_PADDING + position * NODE_CONSTRAINT_HEIGHT,
              palette,
            ),
          ),
        ]),
    `</g>`,
  ].join('')
}

/** An enum card: its members, with the value the database stores when `@map` renames one. */
function renderEnum(card: PlacedEnum, index: number, palette: Palette) {
  const { value } = card
  const left = card.x + HEADER_PADDING_X
  const right = card.x + card.width - HEADER_PADDING_X
  const top = fieldsTop(card)
  return [
    `<g class="enum-node">`,
    renderCard(
      card,
      `enum-clip-${index}`,
      { name: value.name, dbName: value.dbName, pill: 'enum' },
      palette,
    ),
    ...value.values.map((member, position) => {
      const centerY = top + position * NODE_ROW_HEIGHT + NODE_ROW_HEIGHT / 2
      const stored = member.dbName
        ? `<text x="${round(right)}" y="${round(centerY + 11 * 0.36)}" font-family="${FONT_MONO}" font-size="11" text-anchor="end" fill="${palette.faint}">${escapeXml(member.dbName)}</text>`
        : ''
      return `<text x="${round(left)}" y="${round(centerY + 12 * 0.36)}" font-family="${FONT_MONO}" font-size="12" fill="${palette.enumeration}">${escapeXml(truncateLabel(member.name, right - left, 12 * MONO_ADVANCE))}</text>${stored}`
    }),
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

type Edge = {
  readonly relation: Relation
  readonly points: readonly Point[]
  readonly caption: readonly string[]
  readonly dashed: boolean
  /** Which way the end symbols face: the target of a self loop sits on the right of its node. */
  readonly targetTowards: 'left' | 'right'
}

/** Where an edge leaves and enters its models, and what it says along the way. */
function edgeGeometry(
  relation: Relation,
  nodes: ReadonlyMap<string, PlacedNode>,
  cards: readonly Box[],
): Edge | null {
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
  const source = {
    x: from.x + from.width,
    y: anchorY(from, useHeader ? null : relation.from.field),
  }
  const loops = relation.from.model === relation.to.model
  const target = {
    x: loops ? to.x + to.width : to.x,
    y: anchorY(to, useHeader ? null : relation.to.field),
  }
  return {
    relation,
    points: loops ? selfLoopPoints(source, target) : routePoints(source, target, cards),
    caption: edgeCaption(relation),
    // Dashed is "no foreign key backs this", not "many to many" — see `RelationOrigin`.
    dashed: relation.origin === 'annotated' || relation.origin === 'implicit-many-to-many',
    targetTowards: loops ? 'left' : 'right',
  }
}

function renderEdge(edge: Edge, palette: Palette) {
  const source = edge.points[0]
  const target = edge.points.at(-1)
  if (!(source && target)) return ''
  return [
    `<g class="relation-edge">`,
    `<path d="${polylinePath(edge.points)}" fill="none" stroke="${palette.edge}" stroke-width="1.4"${edge.dashed ? ' stroke-dasharray="5 4"' : ''}/>`,
    renderCardinality(edge.relation.from.cardinality, source, 'left', palette),
    renderCardinality(edge.relation.to.cardinality, target, edge.targetTowards, palette),
    `</g>`,
  ].join('')
}

/** The dotted links from every enum-typed field to the card that lists its values. */
function enumLinks(
  nodes: readonly PlacedNode[],
  enums: readonly PlacedEnum[],
  cards: readonly Box[],
): readonly (readonly Point[])[] {
  return nodes.flatMap((node) =>
    node.fields.flatMap((field) => {
      const card = enums.find((candidate) => candidate.value.name === field.type)
      if (field.kind !== 'enum' || card === undefined) return []
      const source = { x: node.x + node.width, y: anchorY(node, field.name) }
      const target = { x: card.x, y: card.y + NODE_HEADER_HEIGHT / 2 }
      return [routePoints(source, target, cards)]
    }),
  )
}

function renderEnumLink(points: readonly Point[], palette: Palette) {
  return `<g class="enum-edge"><path d="${polylinePath(points)}" fill="none" stroke="${palette.enumeration}" stroke-width="1.2" stroke-dasharray="2 4" opacity="0.75"/></g>`
}

// The relation leads, in the plain colour; what it does to a row follows in the quiet one.
function renderCaption(caption: readonly string[], box: Box, palette: Palette) {
  const center = box.x + box.width / 2
  const lines = caption.map((line, index) => {
    const baseline =
      box.y +
      EDGE_LABEL_PADDING / 2 +
      (index + 0.5) * EDGE_LABEL_LINE_HEIGHT +
      EDGE_LABEL_FONT_SIZE * 0.36
    return `<text x="${round(center)}" y="${round(baseline)}" font-family="${FONT_MONO}" font-size="${EDGE_LABEL_FONT_SIZE}" text-anchor="middle" fill="${index === 0 ? palette.muted : palette.faint}">${escapeXml(line)}</text>`
  })
  return `<g class="relation-label"><rect x="${round(box.x)}" y="${round(box.y)}" width="${round(box.width)}" height="${round(box.height)}" rx="3" fill="${palette.surface}" stroke="${palette.lineStrong}" stroke-width="0.8"/>${lines.join('')}</g>`
}

function union(boxes: readonly Box[]): Box {
  const minX = Math.min(...boxes.map((box) => box.x))
  const minY = Math.min(...boxes.map((box) => box.y))
  const maxX = Math.max(...boxes.map((box) => box.x + box.width))
  const maxY = Math.max(...boxes.map((box) => box.y + box.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function pad(box: Box, padding: number): Box {
  return {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + padding * 2,
    height: box.height + padding * 2,
  }
}

/** The bounding box of the models with the canvas margin around them. */
export function diagramBounds(models: readonly Model[], positions: LayoutPositions) {
  const nodes = placeNodes(models, positions)
  if (nodes.length === 0) return { x: 0, y: 0, width: PADDING * 2, height: PADDING * 2 }
  return pad(union(nodes), PADDING)
}

/**
 * Draws the ER diagram as Studio shows it: one node per model with its scalar fields, a
 * smoothstep edge per relation in crow's-foot notation, and a key to the symbols. The result is a
 * standalone SVG document with the canvas behind it.
 */
export function renderDiagramSvg(input: DiagramInput) {
  const palette = PALETTES[input.theme ?? 'light']
  const nodes = placeNodes(input.models, input.positions)
  const enums = placeEnums(input.enums ?? [], input.positions)
  const byName = new Map(nodes.map((node) => [node.model.name, node]))
  const cards = [...nodes, ...enums]
  const edges = input.relations
    .map((relation) => edgeGeometry(relation, byName, cards))
    .filter((edge) => edge !== null)
  const links = enumLinks(nodes, enums, cards)
  // The captions are laid out before the drawing is sized, so none of them falls outside it. The
  // enum links join in without a caption of their own: they are wires a caption has to stay off.
  const captions = placeCaptions(
    [...edges, ...links.map((points) => ({ caption: [], points }))],
    cards,
  )
  // The end symbols reach back along the edge, so an endpoint takes a little room of its own.
  const ends = [...edges.map((edge) => edge.points), ...links].flatMap((points) =>
    points.map((point) => ({ x: point.x, y: point.y, width: 0, height: 0 })),
  )
  const content = pad(
    union([
      ...(cards.length === 0 ? [{ x: 0, y: 0, width: 0, height: 0 }] : cards),
      ...ends.map((end) => pad(end, 20)),
      ...captions.map((caption) => caption.box),
    ]),
    PADDING,
  )
  const bounds = content
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${round(bounds.width)}" height="${round(bounds.height)}" viewBox="${round(bounds.x)} ${round(bounds.y)} ${round(bounds.width)} ${round(bounds.height)}">`,
    `<defs>`,
    `<pattern id="dots" x="${round(bounds.x)}" y="${round(bounds.y)}" width="${DOT_GAP}" height="${DOT_GAP}" patternUnits="userSpaceOnUse"><circle cx="${DOT_RADIUS}" cy="${DOT_RADIUS}" r="${DOT_RADIUS}" fill="${palette.dots}"/></pattern>`,
    `<filter id="node-shadow" x="-5%" y="-5%" width="110%" height="115%"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000000" flood-opacity="0.08"/></filter>`,
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
