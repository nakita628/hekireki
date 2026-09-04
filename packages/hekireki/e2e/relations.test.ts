// The diagram of a schema with every relation shape, so the IE (crow's foot) notation is checked
// on all four cardinalities at once. The workspace fixture is deliberately small; this test swaps
// the schema in through the API and puts it back afterwards.
import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { Page } from '@playwright/test'

import { expect, loadedFiles, resetSchema, test } from './studio.js'
import { FIXTURES_DIR } from './workspace.js'

test.afterEach(async ({ request }) => {
  await resetSchema(request)
})

/**
 * What the drawing hides from a reader, read back off the rendered page: the wires that run
 * behind a model, and the captions that sit on one. Both are empty in a diagram that can be
 * followed.
 */
async function hidden(page: Page) {
  return page.evaluate(() => {
    const boxOf = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom }
    }
    const overlaps = (a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>) =>
      a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom
    const cards = [...document.querySelectorAll('.react-flow__node')].map((node) => ({
      id: node.getAttribute('data-id') ?? '',
      box: boxOf(node),
    }))
    // A card's own border is where its edges begin, so the last few pixels do not count.
    const inset = (box: ReturnType<typeof boxOf>) => ({
      x: box.x + 3,
      y: box.y + 3,
      right: box.right - 3,
      bottom: box.bottom - 3,
    })
    const wires = [...document.querySelectorAll('.react-flow__edge')].map((edge) => {
      const wire = edge.querySelector('.react-flow__edge-path')
      const geometry = wire as SVGPathElement | null
      const length = geometry?.getTotalLength() ?? 0
      const matrix = geometry?.getScreenCTM() ?? null
      const points = Array.from({ length: 201 }, (_, step) => {
        const at = geometry?.getPointAtLength((length * step) / 200) ?? { x: 0, y: 0 }
        return {
          x: at.x * (matrix?.a ?? 1) + (matrix?.e ?? 0),
          y: at.y * (matrix?.d ?? 1) + (matrix?.f ?? 0),
        }
      })
      return { id: edge.getAttribute('data-id') ?? '', points }
    })
    const inside = (point: { x: number; y: number }, box: ReturnType<typeof boxOf>) =>
      point.x > box.x && point.x < box.right && point.y > box.y && point.y < box.bottom
    return {
      wiresBehindCards: wires.flatMap((wire) =>
        cards
          .filter((card) => wire.points.some((point) => inside(point, inset(card.box))))
          .map((card) => `${wire.id} behind ${card.id}`),
      ),
      captionsOverCards: [...document.querySelectorAll('.relation-label')].flatMap((label) =>
        cards
          .filter((card) => overlaps(boxOf(label), card.box))
          .map((card) => `${label.textContent ?? ''} over ${card.id}`),
      ),
    }
  })
}

test('the diagram draws every cardinality in IE notation', async ({ page, request }) => {
  const files = await loadedFiles(request)
  const write = async (name: string, content: string) => {
    const file = files.find((loaded) => path.basename(loaded.path) === name)
    if (file === undefined) throw new Error(`${name} is not loaded`)
    const response = await request.put('/api/schema/files', { data: { path: file.path, content } })
    expect(response.ok()).toBe(true)
  }
  // The one schema file holds every model, so the other is emptied first: between the two writes
  // the models would otherwise be declared twice.
  await write('post.prisma', '')
  await write('base.prisma', readFileSync(path.join(FIXTURES_DIR, 'relations.prisma'), 'utf8'))

  await page.goto('/')
  await expect(page.getByText('8 models · 8 relations · 1 enums')).toBeVisible()
  // Eight models, the Role enum, and one edge per relation plus one per enum-typed field.
  await expect(page.locator('.react-flow__node')).toHaveCount(9)
  await expect(page.locator('.react-flow__edge')).toHaveCount(10)

  // Both ends of every edge, as the browser resolved them: the parent end says whether the
  // foreign key may be null, and the child end whether the back relation is a list.
  const ends = await page
    .locator('.react-flow__edge.relation-edge')
    .evaluateAll((edges) =>
      edges
        .map((edge) => [
          edge.getAttribute('data-id') ?? '',
          edge.querySelector('.react-flow__edge-path')?.getAttribute('marker-start') ?? '',
          edge.querySelector('.react-flow__edge-path')?.getAttribute('marker-end') ?? '',
        ])
        .toSorted((a, b) => ((a[0] ?? '') < (b[0] ?? '') ? -1 : 1)),
    )
  expect(ends).toStrictEqual([
    ['Category.id->Category.parentId', "url('#er-zero-one')", "url('#er-zero-many')"],
    ['Post.id->Comment.postId', "url('#er-one')", "url('#er-zero-many')"],
    ['Post.tags->Tag.posts', "url('#er-zero-many')", "url('#er-zero-many')"],
    ['User.id->Comment.authorId', "url('#er-zero-one')", "url('#er-zero-many')"],
    ['User.id->Membership.userId', "url('#er-one')", "url('#er-many')"],
    ['User.id->Post.authorId', "url('#er-one')", "url('#er-zero-many')"],
    ['User.id->Profile.userId', "url('#er-one')", "url('#er-zero-one')"],
    ['User.id->Settings.userId', "url('#er-zero-one')", "url('#er-zero-one')"],
  ])

  // The dashed edges are the ones Prisma did not derive from a foreign key.
  await expect(page.locator('.relation-edge--implicit-many-to-many')).toHaveCount(1)
  await expect(page.locator('.relation-edge--annotated')).toHaveCount(1)

  // Every relation says what it is, in the label layer that is lifted over the models, so a
  // caption can no longer end up behind a card.
  await expect(page.locator('.relation-label')).toHaveCount(8)
  await expect(page.locator('.relation-label').first()).toBeVisible()

  // What the diagram is for: every relation has to be followable. A wire that runs behind a card
  // and a chip that sits across one both break that, and the screenshot alone would not say so.
  expect(await hidden(page)).toStrictEqual({ wiresBehindCards: [], captionsOverCards: [] })

  // The enum is a card of its own, linked to the two fields that hold one of its values.
  await expect(page.locator('.enum-node')).toHaveCount(1)
  await expect(page.locator('.enum-node').getByText('VIEWER')).toBeVisible()
  await expect(page.locator('.react-flow__edge.enum-edge')).toHaveCount(2)

  await expect(page).toHaveScreenshot('relations.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02,
  })
})
