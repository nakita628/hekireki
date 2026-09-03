// The Data tab and the SQL page against the SQLite workspace database.
import { expect, expectNoHorizontalOverflow, expectTexts, test } from './studio.js'

test('the sidebar counts rows and the grid shows them', async ({ page }) => {
  await page.goto('/models/User?tab=data')
  await expect(page.getByRole('complementary').getByText('(rows)')).toBeVisible()
  await expect(page.getByText('3 rows', { exact: true })).toBeVisible()
  const grid = page.getByRole('table')
  await expectTexts(grid, ['id', 'email', 'name', 'role'])
  await expect(grid.getByRole('row')).toHaveCount(4)
  await expectTexts(grid, ['ada@example.com', 'bob@example.com', 'cy@example.com'])
  await expect(page.getByText('1–3 of 3 rows')).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('searches, edits a cell, adds and deletes a row', async ({ page }) => {
  await page.goto('/models/User?tab=data')
  const grid = page.getByRole('table')
  await page.getByPlaceholder('Search every column…').fill('bob')
  await expect(grid.getByRole('row')).toHaveCount(2)
  await expect(grid).toContainText('bob@example.com')

  // Editing a cell: click, type, Enter.
  await grid.getByRole('cell', { name: 'Bob', exact: true }).click()
  const cell = grid.locator('input.cell-input')
  await expect(cell).toHaveValue('Bob')
  await cell.fill('Robert')
  await cell.press('Enter')
  await expect(grid).toContainText('Robert')
  await page.getByPlaceholder('Search every column…').fill('')
  await expect(grid.getByRole('row')).toHaveCount(4)

  // Adding a row: the form row takes the required columns and saves.
  await page.getByRole('button', { name: 'Add row' }).click()
  await grid.getByPlaceholder('required').fill('dee@example.com')
  await grid.getByRole('button', { name: 'Save row' }).click()
  await expect(page.getByText('4 rows', { exact: true })).toBeVisible()
  await expect(grid).toContainText('dee@example.com')

  // Deleting it again, through the confirm dialog.
  page.once('dialog', (dialog) => dialog.accept())
  await grid
    .getByRole('row')
    .filter({ hasText: 'dee@example.com' })
    .getByRole('button', { name: 'Delete row' })
    .click()
  await expect(page.getByText('3 rows', { exact: true })).toBeVisible()

  // Put Bob's name back for the other tests.
  await grid.getByRole('cell', { name: 'Robert', exact: true }).click()
  await grid.locator('input.cell-input').fill('Bob')
  await grid.locator('input.cell-input').press('Enter')
  await expect(grid).toContainText('Bob')
})

test('the SQL page runs a query and tabulates the result', async ({ page }) => {
  await page.goto('/sql')
  await expect(page.getByRole('heading', { level: 1, name: 'SQL' })).toBeVisible()
  await expect(page.getByText(/sqlite ·/u).first()).toBeVisible()
  const sql = page.getByRole('textbox')
  await sql.fill('SELECT title, published FROM "Post" ORDER BY id')
  await page.getByRole('button', { name: 'Run' }).click()
  const result = page.getByRole('table')
  await expect(result.getByRole('columnheader')).toHaveText(['title', 'published'])
  await expect(result.getByRole('row')).toHaveCount(4)
  await expectTexts(result, ['Hello', 'Draft', 'Notes'])

  await sql.fill('SELECT count(*) AS n FROM "User"')
  await sql.press('Control+Enter')
  await expect(result.getByRole('columnheader')).toHaveText(['n'])
  await expect(result).toContainText('3')
  await expectNoHorizontalOverflow(page)
})
