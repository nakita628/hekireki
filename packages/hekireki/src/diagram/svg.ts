import {
  EDGE_LABEL_FONT_SIZE,
  EDGE_LABEL_LINE_HEIGHT,
  EDGE_LABEL_PADDING,
  EDGE_OFFSET,
  ENUM_WIDTH,
  GRID,
  MONO_ADVANCE,
  NODE_CONSTRAINT_HEIGHT,
  NODE_HEADER_HEIGHT,
  NODE_PADDING,
  NODE_ROW_HEIGHT,
  NODE_WIDTH,
  PALETTES,
} from '../constants/index.js'
import type {
  Box,
  Cardinality,
  DiagramIndex,
  DiagramInput,
  DiagramTheme,
  LayoutPositions,
  Point,
  Position,
  SchemaEnum,
  SchemaField,
  SchemaModel,
  SchemaRelation,
} from '../types/index.js'
import {
  loopRoom,
  placeCaptions,
  polylinePath,
  round,
  selfLoopPoints,
  routePoints,
  separateRoutes,
} from './edge.js'
import {
  diagramConstraints,
  diagramFields,
  enumHeight,
  fieldDetail,
  fieldRowHeight,
  nodeHeight,
  uniqueColumns,
} from './layout.js'
import { textUnits, truncateLabel } from './text.js'

// Family names stay unquoted: resvg drops a quoted name that follows an unquoted one.
const FONT_MONO =
  'ui-monospace, SF Mono, Menlo, Consolas, Liberation Mono, DejaVu Sans Mono, monospace'
const FONT_SANS =
  'ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, DejaVu Sans, sans-serif'

// The same two stacks with the families that cover CJK in front. A browser picks a font per
// glyph, so the stacks above are what the SVG carries; resvg stops at the first family the
// machine has and never looks further for a glyph that family lacks, so with a Latin face in
// front it drops Japanese text — the whole text run, not just the glyphs it cannot draw.
const FONT_MONO_RASTER = `Noto Sans Mono CJK JP, Source Han Mono, BIZ UDGothic, MS Gothic, IPAGothic, ${FONT_MONO}`
const FONT_SANS_RASTER = `Noto Sans CJK JP, Hiragino Sans, Yu Gothic UI, Meiryo, IPAPGothic, ${FONT_SANS}`

/**
 * The drawing with the raster font stacks in place of the ones a browser reads, for a rasteriser
 * without per-glyph fallback. A machine with none of those families draws what it drew before.
 */
export function withRasterFonts(svg: string) {
  return svg.replaceAll(FONT_MONO, FONT_MONO_RASTER).replaceAll(FONT_SANS, FONT_SANS_RASTER)
}

// Glyph advance as a fraction of the font size, for the faces besides the plain monospace one.
const MONO_BOLD_ADVANCE = 0.66
const SANS_ADVANCE = 0.52
// How far below the middle of a line its baseline sits, as a fraction of the font size: what
// centres a line of text on a row, since resvg reads no `dominant-baseline`.
const BASELINE = 0.36

// The type of a card: the name in its header; a field's or member's name; its type, which the
// table name, a stored enum value and the `enum` pill share; the faint line under a field; and
// the columns of a block attribute.
const HEADER_FONT_SIZE = 13
const NAME_FONT_SIZE = 12
const TYPE_FONT_SIZE = 11
const DETAIL_FONT_SIZE = 10.5
const CONSTRAINT_FONT_SIZE = 10.5
// How far below the top of a field row its faint second line is centred.
const DETAIL_CENTER = 26
// The share of a row a field's type may take before it is cut, and a member's stored value: what
// each leaves is the name's.
const TYPE_SHARE = 0.6
const STORED_SHARE = 0.5

const NODE_RADIUS = 8
const HEADER_PADDING_X = 10
// The room between the name in a header, the table name after it and the pill at its end.
const HEADER_GAP = 8
// The table name after a model's name is quieter than the name, as the pill behind `enum` is.
const TABLE_NAME_OPACITY = 0.6
const PILL_HEIGHT = 16
const PILL_TINT = 0.15
const ROW_GAP = 6
const ICON_SIZE = 11
// The field icons are drawn on a grid of this many units (components/icons.tsx), with a stroke of
// that grid's own, and scaled down to ICON_SIZE.
const ICON_GRID = 24
const ICON_STROKE = 2
const BADGE_HEIGHT = 12
const BADGE_FONT_SIZE = 8.5
const BADGE_PADDING_X = 4
const BADGE_RADIUS = 3
const BADGE_TINT = 0.14
// The line between a card's fields and its block attributes.
const DIVIDER_WIDTH = 1

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

// The two field icons of the model node (components/icons.tsx), on a 24-unit grid.
const KEY_ICON =
  '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>'
const LINK_ICON =
  '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'

type Palette = (typeof PALETTES)[DiagramTheme]

type PlacedNode = {
  readonly model: SchemaModel
  readonly fields: readonly SchemaField[]
  readonly constraints: readonly DiagramIndex[]
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

type PlacedEnum = {
  readonly value: SchemaEnum
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

function escapeXml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function monoWidth(text: string, fontSize: number) {
  return textUnits(text) * fontSize * MONO_ADVANCE
}

function sansWidth(text: string, fontSize: number) {
  return textUnits(text) * fontSize * SANS_ADVANCE
}

export function fieldTypeLabel(field: SchemaField) {
  return `${field.type}${field.isList ? '[]' : ''}${field.isRequired || field.isList ? '' : '?'}`
}

function placeNodes(
  models: readonly SchemaModel[],
  positions: LayoutPositions,
): readonly PlacedNode[] {
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
  values: readonly SchemaEnum[],
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
function customRelationName(relation: SchemaRelation) {
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
function relationshipKind(relation: SchemaRelation) {
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
export function edgeCaption(relation: SchemaRelation): readonly string[] {
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

function fieldIcon(field: SchemaField, primaryKey: ReadonlySet<string>, palette: Palette) {
  if (field.isId || primaryKey.has(field.name)) return { icon: KEY_ICON, color: palette.key }
  if (field.isForeignKey) return { icon: LINK_ICON, color: palette.accent }
  return null
}

function renderIcon(icon: string, color: string, x: number, y: number, size: number) {
  return `<g transform="translate(${round(x)} ${round(y)}) scale(${round(size / ICON_GRID)})" fill="none" stroke="${color}" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round">${icon}</g>`
}

/** A small rounded chip with a word in it, tinted with the colour of what it marks. */
function renderBadge(label: string, x: number, centerY: number, color: string) {
  const width = sansWidth(label, BADGE_FONT_SIZE) + BADGE_PADDING_X * 2
  const svg = [
    `<rect x="${round(x)}" y="${round(centerY - BADGE_HEIGHT / 2)}" width="${round(width)}" height="${BADGE_HEIGHT}" rx="${BADGE_RADIUS}" fill="${color}" fill-opacity="${BADGE_TINT}"/>`,
    `<text x="${round(x + width / 2)}" y="${round(centerY + BADGE_FONT_SIZE * BASELINE)}" font-family="${FONT_SANS}" font-size="${BADGE_FONT_SIZE}" font-weight="600" text-anchor="middle" fill="${color}">${escapeXml(label)}</text>`,
  ].join('')
  return { svg, width }
}

function badgeWidth(label: string) {
  return sansWidth(label, BADGE_FONT_SIZE) + BADGE_PADDING_X * 2
}

/** The `UK` a field carries: covered by a unique constraint, and not already wearing the key. */
function uniqueBadge(
  field: SchemaField,
  primaryKey: ReadonlySet<string>,
  unique: ReadonlySet<string>,
) {
  return unique.has(field.name) && !(field.isId || primaryKey.has(field.name)) ? 'UK' : null
}

function renderRow(node: PlacedNode, field: SchemaField, top: number, palette: Palette) {
  const primaryKey = new Set(node.model.primaryKey)
  const unique = uniqueColumns(node.model)
  const left = node.x + HEADER_PADDING_X
  const right = node.x + node.width - HEADER_PADDING_X
  const centerY = top + NODE_ROW_HEIGHT / 2
  const icon = fieldIcon(field, primaryKey, palette)
  // The type is drawn from the right edge inwards, so without a bound of its own a long one runs
  // out of the card and off the drawing. Six tenths of the row leaves the name something to sit in.
  const type = truncateLabel(
    fieldTypeLabel(field),
    (right - left) * TYPE_SHARE,
    TYPE_FONT_SIZE * MONO_ADVANCE,
  )
  const typeWidth = monoWidth(type, TYPE_FONT_SIZE)
  const badge = uniqueBadge(field, primaryKey, unique)
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
    NAME_FONT_SIZE * MONO_ADVANCE,
  )
  const detail = fieldDetail(field)
  const iconSvg = icon
    ? renderIcon(icon.icon, icon.color, left, centerY - ICON_SIZE / 2, ICON_SIZE)
    : ''
  const detailSvg = detail
    ? `<text x="${round(nameLeft)}" y="${round(top + DETAIL_CENTER + DETAIL_FONT_SIZE * BASELINE)}" font-family="${FONT_SANS}" font-size="${DETAIL_FONT_SIZE}" fill="${palette.faint}">${escapeXml(truncateLabel(detail, right - nameLeft, DETAIL_FONT_SIZE * SANS_ADVANCE))}</text>`
    : ''
  return [
    iconSvg,
    badgeSvg,
    `<text x="${round(nameLeft)}" y="${round(centerY + NAME_FONT_SIZE * BASELINE)}" font-family="${FONT_MONO}" font-size="${NAME_FONT_SIZE}" fill="${palette.ink}">${escapeXml(name)}</text>`,
    `<text x="${round(right)}" y="${round(centerY + TYPE_FONT_SIZE * BASELINE)}" font-family="${FONT_MONO}" font-size="${TYPE_FONT_SIZE}" text-anchor="end" fill="${field.kind === 'enum' ? palette.enumeration : palette.muted}">${escapeXml(type)}</text>`,
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
  return `${badge.svg}<text x="${round(columnsLeft)}" y="${round(centerY + CONSTRAINT_FONT_SIZE * BASELINE)}" font-family="${FONT_MONO}" font-size="${CONSTRAINT_FONT_SIZE}" fill="${palette.muted}">${escapeXml(columns)}</text>`
}

/** The card behind a block: the rounded surface, its dark header band and the header text. */
function renderCard(
  card: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  id: string,
  header: { readonly name: string; readonly dbName: string | null; readonly pill: string | null },
  palette: Palette,
) {
  // A pill's ends are round, so it is padded by a radius at either end: its height in all.
  const pillWidth = header.pill === null ? 0 : sansWidth(header.pill, TYPE_FONT_SIZE) + PILL_HEIGHT
  const pillX = card.x + card.width - HEADER_PADDING_X - pillWidth
  const nameLeft = card.x + HEADER_PADDING_X
  // Cut to the room before the pill: a long model or enum name used to run out of the header,
  // over the `enum` pill and past the edge of the drawing.
  const name = truncateLabel(
    header.name,
    pillX - HEADER_GAP - nameLeft,
    HEADER_FONT_SIZE * MONO_BOLD_ADVANCE,
  )
  const nameWidth = textUnits(name) * HEADER_FONT_SIZE * MONO_BOLD_ADVANCE
  const dbNameLeft = nameLeft + nameWidth + HEADER_GAP
  const dbName = header.dbName
    ? truncateLabel(header.dbName, pillX - HEADER_GAP - dbNameLeft, TYPE_FONT_SIZE * MONO_ADVANCE)
    : ''
  const headerCenter = card.y + NODE_HEADER_HEIGHT / 2
  return [
    `<clipPath id="${id}"><rect x="${round(card.x)}" y="${round(card.y)}" width="${round(card.width)}" height="${round(card.height)}" rx="${NODE_RADIUS}"/></clipPath>`,
    `<rect x="${round(card.x)}" y="${round(card.y)}" width="${round(card.width)}" height="${round(card.height)}" rx="${NODE_RADIUS}" fill="${palette.surface}" stroke="${palette.lineStrong}" filter="url(#node-shadow)"/>`,
    `<rect x="${round(card.x)}" y="${round(card.y)}" width="${round(card.width)}" height="${NODE_HEADER_HEIGHT}" fill="${palette.node}" clip-path="url(#${id})"/>`,
    // One text run, so the table name follows the model name at its real width whatever font is used.
    `<text x="${round(nameLeft)}" y="${round(headerCenter + HEADER_FONT_SIZE * BASELINE)}" font-family="${FONT_MONO}" font-size="${HEADER_FONT_SIZE}" font-weight="700" fill="${palette.nodeText}">${escapeXml(name)}${
      dbName
        ? `<tspan dx="${HEADER_GAP}" font-size="${TYPE_FONT_SIZE}" font-weight="400" opacity="${TABLE_NAME_OPACITY}">${escapeXml(dbName)}</tspan>`
        : ''
    }</text>`,
    ...(header.pill === null
      ? []
      : [
          `<rect x="${round(pillX)}" y="${round(headerCenter - PILL_HEIGHT / 2)}" width="${round(pillWidth)}" height="${PILL_HEIGHT}" rx="${PILL_HEIGHT / 2}" fill="${palette.surface}" opacity="${PILL_TINT}"/>`,
          `<text x="${round(pillX + pillWidth / 2)}" y="${round(headerCenter + TYPE_FONT_SIZE * BASELINE)}" font-family="${FONT_SANS}" font-size="${TYPE_FONT_SIZE}" text-anchor="middle" fill="${palette.nodeText}">${escapeXml(header.pill)}</text>`,
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
          `<path d="M${round(node.x)} ${round(rows.top + NODE_PADDING)}H${round(node.x + node.width)}" stroke="${palette.lineStrong}" stroke-width="${DIVIDER_WIDTH}"/>`,
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
      // Both are cut, and the member name takes only what the stored name leaves: each is drawn
      // from its own edge, so an uncut one runs over the other and out of the card.
      const dbName = member.dbName
        ? truncateLabel(member.dbName, (right - left) * STORED_SHARE, TYPE_FONT_SIZE * MONO_ADVANCE)
        : ''
      const stored =
        dbName === ''
          ? ''
          : `<text x="${round(right)}" y="${round(centerY + TYPE_FONT_SIZE * BASELINE)}" font-family="${FONT_MONO}" font-size="${TYPE_FONT_SIZE}" text-anchor="end" fill="${palette.faint}">${escapeXml(dbName)}</text>`
      const nameRoom =
        right - left - (dbName === '' ? 0 : monoWidth(dbName, TYPE_FONT_SIZE) + ROW_GAP)
      return `<text x="${round(left)}" y="${round(centerY + NAME_FONT_SIZE * BASELINE)}" font-family="${FONT_MONO}" font-size="${NAME_FONT_SIZE}" fill="${palette.enumeration}">${escapeXml(truncateLabel(member.name, nameRoom, NAME_FONT_SIZE * MONO_ADVANCE))}</text>${stored}`
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
    ? `<circle cx="${MIN_ZERO_CENTER}" cy="0" r="${MIN_ZERO_RADIUS}" fill="${palette.surface}"/>`
    : `<path d="${MIN_ONE_BAR}"/>`
  return `<g transform="translate(${round(point.x)} ${round(point.y)})${flip}" fill="none" stroke="${palette.edge}" stroke-width="${EDGE_WIDTH}"><path d="${max}"/>${minimum}</g>`
}

type Edge = {
  readonly relation: SchemaRelation
  readonly points: readonly Point[]
  readonly caption: readonly string[]
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

/** How an edge runs between its ends, round `obstacles`, and what it says along the way. */
function edgeGeometry(
  { relation, loops, source, target }: NonNullable<ReturnType<typeof edgeEnds>>,
  obstacles: readonly Box[],
): Edge {
  return {
    relation,
    points: loops ? selfLoopPoints(source, target) : routePoints(source, target, obstacles),
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
    `<path d="${polylinePath(edge.points)}" fill="none" stroke="${palette.edge}" stroke-width="${EDGE_WIDTH}"${edge.dashed ? ` stroke-dasharray="${EDGE_DASH}"` : ''}/>`,
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
  const anchored = input.relations
    .map((relation) => edgeEnds(relation, byName))
    .filter((end) => end !== null)
  // The caption of a self relation stands beside its loop, out in the gap by its card, and the
  // wires of that gap go round it as round a card.
  const obstacles = [
    ...cards,
    ...anchored
      .filter((end) => end.loops)
      .map((end) => loopRoom(selfLoopPoints(end.source, end.target), edgeCaption(end.relation))),
  ]
  const routed = anchored.map((end) => edgeGeometry(end, obstacles))
  // The enum links are drawn apart from the relations as much as from each other: a dotted wire
  // on top of a solid one reads as neither.
  const separated = separateRoutes(
    [...routed.map((edge) => edge.points), ...enumLinks(nodes, enums, obstacles)],
    obstacles,
  )
  const edges = routed.map((edge, index) => ({ ...edge, points: separated[index] ?? edge.points }))
  const links = separated.slice(routed.length)
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
      ...ends.map((end) => pad(end, EDGE_OFFSET)),
      ...captions.map((caption) => caption.box),
    ]),
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
