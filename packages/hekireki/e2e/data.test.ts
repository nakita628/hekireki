// The Data tab and the SQL page against the SQLite workspace database.
import { expect, expectNoHorizontalOverflow, expectTexts, test } from './studio.js'

test('the sidebar counts rows and the grid shows them', async ({ page }) => {
  await page.goto('/models/User?tab=data')
  await expect(page.getByRole('complementary').getByText('(rows)')).toBeVisible()
  await expect(page.getByText('3 rows', { exact: true })).toBeVisible()
  const grid = page.getByRole('grid')
  await expectTexts(grid, ['id', 'email', 'name', 'role'])
  await expect(grid.getByRole('row')).toHaveCount(4)
  await expectTexts(grid, ['ada@example.com', 'bob@example.com', 'cy@example.com'])
  await expect(page.getByText('1–3 of 3 rows')).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('searches, edits a cell, adds and deletes a row', async ({ page }) => {
  await page.goto('/models/User?tab=data')
  const grid = page.getByRole('grid')
  await page.getByPlaceholder('Search every column…').fill('bob')
  await expect(grid.getByRole('row')).toHaveCount(2)
  await expect(grid).toContainText('bob@example.com')
  // What put the row on screen is marked in it, whichever column it was found in.
  await expect(grid.locator('mark')).toHaveText(['bob', 'Bob'])

  // Editing a cell: click, type, Enter.
  await grid.getByRole('gridcell', { name: 'Bob', exact: true }).click()
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

  // Deleting it again, through the row menu and the dialog that names the row.
  await grid
    .getByRole('row')
    .filter({ hasText: 'dee@example.com' })
    .getByRole('button', { name: /^Actions for/u })
    .click()
  await page.getByRole('menuitem', { name: 'Delete row' }).click()
  await expect(page.getByRole('button', { name: 'Delete 1 row' })).toBeVisible()
  await page.getByRole('button', { name: 'Delete 1 row' }).click()
  await expect(page.getByText('3 rows', { exact: true })).toBeVisible()
  await expect(grid).not.toContainText('dee@example.com')

  // Put Bob's name back for the other tests.
  await grid.getByRole('gridcell', { name: 'Robert', exact: true }).click()
  await grid.locator('input.cell-input').fill('Bob')
  await grid.locator('input.cell-input').press('Enter')
  await expect(grid).toContainText('Bob')
})

test('ticking rows deletes them together', async ({ page }) => {
  await page.goto('/models/User?tab=data')
  const grid = page.getByRole('grid')
  for (const email of ['eve@example.com', 'fay@example.com']) {
    await page.getByRole('button', { name: 'Add row' }).click()
    await grid.getByPlaceholder('required').fill(email)
    await grid.getByRole('button', { name: 'Save row' }).click()
    await expect(grid).toContainText(email)
  }
  await expect(page.getByText('5 rows', { exact: true })).toBeVisible()

  // The checkbox is drawn over its input, so the tick is asked for rather than clicked at.
  for (const email of ['eve@example.com', 'fay@example.com']) {
    await grid
      .getByRole('row')
      .filter({ hasText: email })
      .getByRole('checkbox')
      .check({ force: true })
  }
  await expect(page.getByText('2 rows selected')).toBeVisible()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Delete 2 rows' }).click()
  await expect(page.getByText('3 rows', { exact: true })).toBeVisible()
  await expect(page.getByText('2 rows selected')).toBeHidden()
})

test('the SQL page runs a query and tabulates the result', async ({ page }) => {
  await page.goto('/sql')
  await expect(page.getByRole('heading', { level: 1, name: 'SQL' })).toBeVisible()
  await expect(page.getByText(/sqlite ·/u).first()).toBeVisible()
  const sql = page.getByRole('textbox')
  await sql.fill('SELECT title, published FROM "Post" ORDER BY id')
  await page.getByRole('button', { name: 'Run' }).click()
  const result = page.getByRole('grid')
  await expect(result.getByRole('columnheader')).toHaveText(['title', 'published'])
  await expect(result.getByRole('row')).toHaveCount(4)
  await expectTexts(result, ['Hello', 'Draft', 'Notes'])

  // The result is already in the browser, so ordering and narrowing it asks nothing of the server.
  await result.getByRole('columnheader', { name: 'title' }).click()
  await expect(result.getByRole('rowheader')).toHaveText(['Draft', 'Hello', 'Notes'])
  await page.getByPlaceholder('Filter the result…').fill('draft')
  await expect(result.getByRole('rowheader')).toHaveText(['Draft'])
  await expect(page.getByText('1 of 3 shown')).toBeVisible()
  await page.getByPlaceholder('Filter the result…').fill('')

  await sql.fill('SELECT count(*) AS n FROM "User"')
  await sql.press('Control+Enter')
  await expect(result.getByRole('columnheader')).toHaveText(['n'])
  await expect(result).toContainText('3')
  await expectNoHorizontalOverflow(page)
})
