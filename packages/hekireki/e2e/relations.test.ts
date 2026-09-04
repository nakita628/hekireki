// The diagram of a schema with every relation shape, so the IE (crow's foot) notation is checked
// on all four cardinalities at once. The workspace fixture is deliberately small; this test swaps
// the schema in through the API and puts it back afterwards.
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, loadedFiles, resetSchema, test } from './studio.js'
import { FIXTURES_DIR } from './workspace.js'

test.afterEach(async ({ request }) => {
  await resetSchema(request)
})

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
  await expect(page.getByText('8 models · 7 relations · 1 enums')).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(8)
  await expect(page.locator('.react-flow__edge')).toHaveCount(7)

  // Both ends of every edge, as the browser resolved them: the parent end is always "exactly one"
  // except for the implicit many-to-many, and the child end follows the foreign key.
  const ends = await page
    .locator('.react-flow__edge')
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
    ['Category.id->Category.parentId', "url('#er-one')", "url('#er-zero-many')"],
    ['Post.id->Comment.postId', "url('#er-one')", "url('#er-many')"],
    ['Post.tags<->Tag.posts', "url('#er-many')", "url('#er-many')"],
    ['User.id->Comment.authorId', "url('#er-one')", "url('#er-zero-many')"],
    ['User.id->Post.authorId', "url('#er-one')", "url('#er-many')"],
    ['User.id->Profile.userId', "url('#er-one')", "url('#er-one')"],
    ['User.id->Settings.userId', "url('#er-one')", "url('#er-zero-one')"],
  ])

  // The dashed edges are the ones Prisma did not derive from a foreign key.
  await expect(page.locator('.relation-edge--implicit-many-to-many')).toHaveCount(1)

  await expect(page).toHaveScreenshot('relations.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02,
  })
})
