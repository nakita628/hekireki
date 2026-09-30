// The measures and colours the ER diagram is drawn with, shared by the renderer (src/diagram), the
// generator that writes it out, and Studio's canvas, so the export and the page it came from agree.
import type { DiagramTheme } from '../types/index.js'

/**
 * The pitch of the dots on the canvas. Every block sits on it and every distance between blocks
 * is a whole number of it, so the drawing lines up with the paper it is drawn on.
 */
export const GRID = 20

export const NODE_WIDTH = GRID * 17
// Wide enough for a mapped enum name and the `enum` pill beside it.
export const ENUM_WIDTH = GRID * 14
export const NODE_HEADER_HEIGHT = 36
export const NODE_ROW_HEIGHT = 22
export const NODE_DESCRIPTION_HEIGHT = 14
export const NODE_CONSTRAINT_HEIGHT = 20
export const NODE_PADDING = 8

/** How far an edge runs straight out of a card before it is allowed to turn: one step of the grid. */
export const EDGE_OFFSET = GRID
/** How round a wire turns a corner, on the canvas as in the export. */
export const EDGE_BEND_RADIUS = 5
/** How far a self relation reaches to the right of the node it loops back into. */
export const SELF_LOOP_GAP = 34

export const EDGE_LABEL_FONT_SIZE = 9.5
export const EDGE_LABEL_LINE_HEIGHT = 12
export const EDGE_LABEL_PADDING = 4

/**
 * Glyph advance as a fraction of the font size, for the monospace face captions and field rows
 * are set in: what a label is measured, right-aligned and truncated by.
 */
export const MONO_ADVANCE = 0.6

/** The handle an edge hangs off when there is no field row to meet: the card's header. */
export const MODEL_HANDLE = '__model'

// The Studio palette (client/styles.css), value for value, so the export looks like the canvas it
// came from. `key`, `unique` and `enum` are the ones to watch: the canvas reads them from
// `--c-key` / `--c-unique` / `--c-enum`, and a drawing that renders a mark in a different colour
// from the page it was exported from is the failure this table exists to avoid.
export const PALETTES = {
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

/** The colours of one theme. */
export type Palette = (typeof PALETTES)[DiagramTheme]
