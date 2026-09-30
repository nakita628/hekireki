// A block of the drawing: the card of a model, with a row per field and its block attributes under
// them, and the card of an enum, with a row per member.
import {
  ENUM_WIDTH,
  MONO_ADVANCE,
  NODE_CONSTRAINT_HEIGHT,
  NODE_HEADER_HEIGHT,
  NODE_PADDING,
  NODE_ROW_HEIGHT,
  NODE_WIDTH,
} from '../constants/index.js'
import type { Palette } from '../constants/index.js'
import type {
  Box,
  DiagramIndex,
  LayoutPositions,
  Position,
  SchemaEnum,
  SchemaField,
  SchemaModel,
} from '../types/index.js'
import {
  diagramConstraints,
  diagramFields,
  enumHeight,
  fieldDetail,
  fieldRowHeight,
  nodeHeight,
  uniqueColumns,
} from './layout.js'
import { round } from './path.js'
import {
  BASELINE,
  escapeXml,
  FONT_MONO,
  FONT_SANS,
  MONO_BOLD_ADVANCE,
  monoWidth,
  SANS_ADVANCE,
  sansWidth,
  textUnits,
  truncateLabel,
} from './text.js'

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

// The two field icons of the model node (components/icons.tsx), on a 24-unit grid.
const KEY_ICON =
  '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>'
const LINK_ICON =
  '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'

/** The card of a model where it sits: the rows it shows, and the block attributes under them. */
export type PlacedNode = Box & {
  readonly model: SchemaModel
  readonly fields: readonly SchemaField[]
  readonly constraints: readonly DiagramIndex[]
}

/** The card of an enum where it sits. */
export type PlacedEnum = Box & { readonly value: SchemaEnum }

export function fieldTypeLabel(field: SchemaField) {
  return `${field.type}${field.isList ? '[]' : ''}${field.isRequired || field.isList ? '' : '?'}`
}

export function placeNodes(
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

export function placeEnums(
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
function fieldsTop(card: Box) {
  return card.y + NODE_HEADER_HEIGHT + NODE_PADDING
}

/** The vertical centre of a field name, or of the header when the field is not shown. */
export function anchorY(node: PlacedNode, field: string | null) {
  const index = field === null ? -1 : node.fields.findIndex((f) => f.name === field)
  if (index === -1) return node.y + NODE_HEADER_HEIGHT / 2
  const above = node.fields
    .slice(0, index)
    .reduce((sum, current) => sum + fieldRowHeight(current), 0)
  return fieldsTop(node) + above + NODE_ROW_HEIGHT / 2
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
  const width = badgeWidth(label)
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
  card: Box,
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

export function renderNode(node: PlacedNode, index: number, palette: Palette) {
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
export function renderEnum(card: PlacedEnum, index: number, palette: Palette) {
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

export function hasField(node: PlacedNode, field: string) {
  return node.fields.some((f) => f.name === field)
}
