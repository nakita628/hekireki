// cspell:ignore Привет Ελλάδα
import { describe, expect, it } from 'vite-plus/test'

import { truncateLabel } from './text.js'

// 12px monospace at 0.6 em per Latin character, the advance a field name is measured with.
const MONO = 12 * 0.6

describe('truncateLabel', () => {
  it('leaves a label that fits, and cuts one that does not at the width it may take', () => {
    expect(truncateLabel('createdAt', 100, 7.2)).toBe('createdAt')
    expect(truncateLabel('averyveryverylongname', 72, 7.2)).toBe('averyvery…')
  })

  it('gives up on an ellipsis of its own when there is room for nothing else', () => {
    expect(truncateLabel('ab', 5, 7.2)).toBe('…')
  })

  // The bug: a label was measured by `length`, which reads a full-width character as half the
  // width it draws at, so a Japanese one ran out of the card before anything was cut.
  it('spends two units on a full-width character and one on a Latin one', () => {
    const room = 10 * MONO
    // Ten units: ten Latin characters, or five full-width ones.
    expect(truncateLabel('abcdefghij', room, MONO)).toBe('abcdefghij')
    expect(truncateLabel('あいうえお', room, MONO)).toBe('あいうえお')
    // Six full-width characters are twelve units, so they do not: nine units of text, then the
    // ellipsis, which is Latin.
    expect(truncateLabel('あいうえおか', room, MONO)).toBe('あいうえ…')
  })

  it('counts Cyrillic and Greek as one unit, like the Latin they are set beside', () => {
    const room = 6 * MONO
    expect(truncateLabel('Привет', room, MONO)).toBe('Привет')
    expect(truncateLabel('Ελλάδα', room, MONO)).toBe('Ελλάδα')
  })

  // The bug: the label was cut with `slice`, which counts UTF-16 units, so a cut could land in
  // the middle of a surrogate pair and leave half a character for the encoder to write as U+FFFD.
  it('never cuts a character in half, whatever the width leaves room for', () => {
    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u
    const emoji = '🎉'.repeat(40)
    for (let width = 8; width < 240; width += 1) {
      expect(lone.test(truncateLabel(emoji, width, MONO))).toBe(false)
      expect(lone.test(truncateLabel(`a${emoji}`, width, MONO))).toBe(false)
    }
  })

  it('keeps a grapheme of several code points whole', () => {
    // A family emoji is five code points joined by zero-width joiners, and draws as one character.
    const family = '👨‍👩‍👧'
    for (let width = 8; width < 120; width += 1) {
      const cut = truncateLabel(`${family}${family}${family}`, width, MONO)
      expect(cut.replace(/…$/u, '')).toBe(
        family.repeat(cut.replace(/…$/u, '').length / family.length),
      )
    }
  })
})
