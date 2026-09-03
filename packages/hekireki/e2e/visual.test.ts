// Screenshots of the main pages. The baselines under e2e/__screenshots__ were taken in this
// repository's devcontainer (Linux, Chromium); regenerate them where the suite runs with
// `pnpm test:e2e --update-snapshots` before trusting a diff, since fonts differ per machine.
import { editorOf, expect, test } from './studio.js'

const SCREENSHOT = { animations: 'disabled', maxDiffPixelRatio: 0.02 } as const

test('schema page', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await expect(page).toHaveScreenshot('schema.png', SCREENSHOT)
})

test('prisma editor page', async ({ page }) => {
  await page.goto('/prisma')
  await editorOf(page).ready()
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  await expect(page).toHaveScreenshot('editor.png', {
    ...SCREENSHOT,
    // The cursor and the current-line highlight depend on focus.
    mask: [page.locator('.monaco-editor .cursors-layer')],
  })
})

test('model data page', async ({ page }) => {
  await page.goto('/models/User?tab=data')
  await expect(page.getByText('1–3 of 3 rows')).toBeVisible()
  await expect(page).toHaveScreenshot('data.png', SCREENSHOT)
})

test('docs page', async ({ page }) => {
  await page.goto('/docs')
  await expect(page.locator('article')).toContainText('User')
  await expect(page).toHaveScreenshot('docs.png', SCREENSHOT)
})
