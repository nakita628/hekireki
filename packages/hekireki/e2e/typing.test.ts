// What the editor writes has to be what was typed, and nothing besides.
//
// A character that arrives on its own cannot be caught anywhere but here: it comes from the
// editor's own input path, its completion list or its formatter, and each of those is the
// browser's, not ours. `base.prisma` holds no period at all, which makes "the file still has no
// period" a whole invariant in one line — the stray period this file is named for would break it
// wherever it came from.
import { editorOf, expect, fileOnDisk, resetSchema, test } from './studio.js'

/** Field lines with no period between them, so one that turns up came from the editor. */
const FIELDS = [
  'nickname String',
  'age Int',
  'bio String?',
  'slug String @unique',
  'meta Json',
  'raw Bytes',
  'score Decimal',
  'when DateTime @default(now())',
]

test.beforeEach(async ({ page }) => {
  await page.goto('/prisma')
  await editorOf(page).ready()
})

test.afterEach(async ({ request }) => {
  await resetSchema(request)
})

/** Types the lines into `User`, one per line, at the given speed. */
async function typeFields(
  page: Parameters<typeof editorOf>[0],
  lines: readonly string[],
  delay: number,
) {
  const editor = editorOf(page)
  // Line 10 is `name String?`, inside the model.
  await editor.goto(10, 1)
  await page.keyboard.press('End')
  for (const line of lines) {
    await page.keyboard.press('Enter')
    await page.keyboard.type(line, { delay })
  }
}

test('types every character once and nothing else, however fast', async ({ page, request }) => {
  // Slowly enough for the list to settle between keys, at a normal pace, and faster than the
  // editor can redraw: the input path has failed at each of those before.
  await typeFields(page, FIELDS.slice(0, 3), 120)
  await typeFields(page, FIELDS.slice(3, 6), 40)
  await typeFields(page, FIELDS.slice(6), 0)
  // Monaco carries the indentation of the line above onto the new one.
  for (const line of FIELDS) {
    await expect.poll(() => fileOnDisk(request, 'base.prisma')).toContain(`  ${line}`)
  }
  const written = await fileOnDisk(request, 'base.prisma')
  expect(written).not.toContain('.')
})

test('waiting with the completion list open puts nothing in', async ({ page, request }) => {
  const editor = editorOf(page)
  await editor.goto(10, 1)
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await editor.type('nickname Str')
  // The list is what offers `String`; leaving it open must not write it, or anything else.
  await expect(page.locator('.suggest-widget.visible')).toBeVisible()
  await page.waitForTimeout(1200)
  await editor.type('ing')
  await expect.poll(() => fileOnDisk(request, 'base.prisma')).toContain('  nickname String')
  const written = await fileOnDisk(request, 'base.prisma')
  expect(written).not.toContain('.')
  expect(written).not.toContain('nickname StringString')
})

test('an attribute that is written out does not swallow the Enter after it', async ({
  page,
  request,
}) => {
  const editor = editorOf(page)
  await editor.goto(10, 1)
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  // Typed to where the list is open on `@unique`, then finished by hand so it stays open.
  await editor.type('slug String @uniq')
  await expect(page.locator('.suggest-widget.visible')).toBeVisible()
  await editor.type('ue')
  await expect(page.locator('.suggest-widget.visible')).toBeVisible()
  // The Prisma language server marks every attribute a snippet, and the editor takes a snippet
  // on Enter without asking whether it changes anything — writing `@unique` back over itself and
  // running the next line into this one.
  await page.keyboard.press('Enter')
  await editor.type('meta Json')
  await expect
    .poll(() => fileOnDisk(request, 'base.prisma'))
    .toContain('slug String @unique\n  meta Json')
})

test('what an input method commits lands exactly as it was given', async ({ page, request }) => {
  const editor = editorOf(page)
  await editor.goto(10, 1)
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  // An IME hands the editor a finished string rather than a key at a time.
  await page.keyboard.insertText('/// 名前は省略できる')
  await expect.poll(() => fileOnDisk(request, 'base.prisma')).toContain('/// 名前は省略できる')
  expect(await fileOnDisk(request, 'base.prisma')).not.toContain('.')
})

test('formatting moves the spacing and leaves everything else where it was', async ({
  page,
  request,
}) => {
  const editor = editorOf(page)
  await editor.goto(10, 1)
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await editor.type('nickname     String')
  await expect.poll(() => fileOnDisk(request, 'base.prisma')).toContain('nickname     String')
  const before = await fileOnDisk(request, 'base.prisma')

  await page.getByRole('button', { name: 'Format' }).click()
  await expect.poll(() => fileOnDisk(request, 'base.prisma')).not.toBe(before)

  const after = await fileOnDisk(request, 'base.prisma')
  // The formatter lines the columns up; nothing but whitespace is its to change.
  expect(after.replaceAll(/\s+/gu, '')).toBe(before.replaceAll(/\s+/gu, ''))
  expect(after).not.toContain('.')
})

// The header carries a chip that comes up while a line is half-typed and goes again when it is
// finished. A header that wrapped to fit it grew taller and pushed the editor down the page
// mid-keystroke: the text moved under the cursor. Nothing about the header may move the editor.
test.describe('at a width where the header has to choose what to show', () => {
  test.use({ viewport: { width: 1024, height: 800 } })

  test('the editor does not move while an error comes and goes', async ({ page }) => {
    const editor = editorOf(page)
    // Sample where the editor sits and how tall the header is, and keep only what changes.
    await page.evaluate(() => {
      const view = document.querySelector('.monaco-editor')
      const header = document.querySelector('header')
      const seen: { top: number; height: number }[] = []
      Object.defineProperty(globalThis, 'placements', { value: seen, configurable: true })
      setInterval(() => {
        const editorBox = view?.getBoundingClientRect()
        const headerBox = header?.getBoundingClientRect()
        if (editorBox === undefined || headerBox === undefined) return
        const now = { top: Math.round(editorBox.top), height: Math.round(headerBox.height) }
        const last = seen.at(-1)
        if (last === undefined || last.top !== now.top || last.height !== now.height) seen.push(now)
      }, 40)
    })

    await editor.goto(10, 1)
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    // `Nope` is no type, so the chip comes up; naming a type it knows puts it away again.
    await editor.type('nickname Nope')
    await expect(page.locator('header')).toContainText(/error/u)
    await page.keyboard.press('Shift+Home')
    await editor.type('nickname String')
    await expect(page.locator('header')).not.toContainText(/error/u)

    const placements = await page.evaluate(() => Reflect.get(globalThis, 'placements'))
    // One placement, from first sample to last: the editor never went anywhere.
    expect(placements).toHaveLength(1)
  })
})

// The operating system would rather you had typed something else. macOS turns two spaces into a
// period and a space, straight quotes into curly ones, two hyphens into a dash, and it does it to
// a `<textarea>` — which is what drives Monaco here, because turning that off takes the space bar
// with it. A period is not what the space bar was pressed for, and a curly quote is a parse error.
//
// Each substitution reaches the editor as one `insertText` carrying the text the OS decided on.
// This sends the same events and holds the editor to what the keys said. Chromium on Linux makes
// no substitutions of its own, so what arrives here is only ever what this test sends.
const SUBSTITUTIONS = [
  { marker: 'spaces', sent: '. ', meant: ' ', name: 'two spaces' },
  { marker: 'opening', sent: '\u201C', meant: '"', name: 'an opening quote' },
  { marker: 'closing', sent: '\u201D', meant: '"', name: 'a closing quote' },
  { marker: 'apostrophe', sent: '\u2019', meant: "'", name: 'an apostrophe' },
  { marker: 'dash', sent: '\u2014', meant: '-', name: 'a dash' },
]

test('what the operating system would rather you had typed does not reach the schema', async ({
  page,
  request,
}) => {
  const editor = editorOf(page)
  await editor.goto(10, 1)
  await page.keyboard.press('End')
  for (const substitution of SUBSTITUTIONS) {
    await page.keyboard.press('Enter')
    await editor.type(substitution.marker)
    await page.evaluate((text) => {
      const area = document.querySelector('.monaco-editor textarea')
      area?.dispatchEvent(
        new globalThis.InputEvent('beforeinput', {
          inputType: 'insertText',
          data: text,
          bubbles: true,
          cancelable: true,
        }),
      )
    }, substitution.sent)
  }

  await expect
    .poll(() => fileOnDisk(request, 'base.prisma'))
    .toContain(`dash${SUBSTITUTIONS[4]?.meant ?? ''}`)
  const written = await fileOnDisk(request, 'base.prisma')
  for (const substitution of SUBSTITUTIONS) {
    expect(written, substitution.name).toContain(`${substitution.marker}${substitution.meant}`)
    expect(written, substitution.name).not.toContain(substitution.sent)
  }
  // And the one this is named for: no period came out of the space bar.
  expect(written).not.toContain('.')
})
