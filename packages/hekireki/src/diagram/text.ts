// How wide a label draws and where it has to be cut, shared by the cards (svg.ts) and the
// captions on the edges (edge.ts) so the two measure a name the same way.

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
