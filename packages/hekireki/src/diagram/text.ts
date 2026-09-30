// The type the drawing is set in: the font stacks, how wide a label draws and where it has to be
// cut, shared by the cards (card.ts) and the captions (caption.ts, svg.ts) so they measure a name
// the same way.
import { MONO_ADVANCE } from '../constants/index.js'

// The East Asian Wide and Fullwidth blocks, and the emoji that draw as wide as they do. A glyph
// from one of them takes a full em where a Latin one takes about half, so measuring a label by
// `length` reads a Japanese one as half the width it draws at, and nothing is cut until it has
// already left the card.
const WIDE_CHARACTER = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦\u{1F300}-\u{1FAFF}]/u

// A label is spent one grapheme at a time, never one code unit: half a surrogate pair reaches the
// document as `�` once the encoder has had it, and a flag or a family emoji is several code
// points that draw as one character.
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

function graphemes(text: string) {
  return [...GRAPHEMES.segment(text)].map((segment) => segment.segment)
}

function characterUnits(character: string) {
  return WIDE_CHARACTER.test(character) ? 2 : 1
}

/** A label's width in units of the Latin advance; Cyrillic and Greek count as one, CJK as two. */
export function textUnits(text: string) {
  return graphemes(text).reduce((sum, character) => sum + characterUnits(character), 0)
}

/**
 * Cuts a label to the width it may take, ending it with an ellipsis like `truncate` does. The
 * label is spent a grapheme at a time, so a full-width one that no longer fits is left out rather
 * than counted as half, and no character is ever cut in half.
 */
export function truncateLabel(text: string, maxWidth: number, advance: number) {
  const capacity = Math.floor(maxWidth / advance)
  if (textUnits(text) <= capacity) return text
  if (capacity <= 1) return '…'
  // The ellipsis takes a unit of its own, and the first character that does not fit ends the
  // label: spending the rest of the room marks it full for every character after it.
  const room = capacity - 1
  const kept = graphemes(text).reduce<{ readonly taken: string; readonly used: number }>(
    (state, character) => {
      const used = state.used + characterUnits(character)
      return used > room
        ? { taken: state.taken, used: room + 1 }
        : { taken: state.taken + character, used }
    },
    { taken: '', used: 0 },
  )
  return `${kept.taken}…`
}

// Family names stay unquoted: resvg drops a quoted name that follows an unquoted one.
export const FONT_MONO =
  'ui-monospace, SF Mono, Menlo, Consolas, Liberation Mono, DejaVu Sans Mono, monospace'
export const FONT_SANS =
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
export const MONO_BOLD_ADVANCE = 0.66
export const SANS_ADVANCE = 0.52
// How far below the middle of a line its baseline sits, as a fraction of the font size: what
// centres a line of text on a row, since resvg reads no `dominant-baseline`.
export const BASELINE = 0.36

export function escapeXml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function monoWidth(text: string, fontSize: number) {
  return textUnits(text) * fontSize * MONO_ADVANCE
}

export function sansWidth(text: string, fontSize: number) {
  return textUnits(text) * fontSize * SANS_ADVANCE
}
