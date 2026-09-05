// The Data tab and the SQL page against the SQLite workspace database.
import { expect, expectNoHorizontalOverflow, expectTexts, fieldHeaders, test } from './studio.js'
import { runSql } from './workspace.js'

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

  // Clicking a value picks it, and picks it only: no editor opens on a click that meant to read.
  await grid.getByRole('gridcell', { name: 'Bob', exact: true }).click()
  await expect(grid.locator('input.cell-input')).toHaveCount(0)
  // Editing a cell: the pencil on it, type, Enter.
  await grid.getByRole('button', { name: 'Edit name' }).click()
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
  await grid.getByRole('gridcell', { name: 'Robert', exact: true }).hover()
  await grid.getByRole('button', { name: 'Edit name' }).click()
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

test('copies one cell and folds columns away', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText())
  await page.goto('/models/User?tab=data')
  const grid = page.getByRole('grid')

  // A cell's own copy button takes that one value, and so does ⌘C on the picked cell — even
  // with a row ticked, the chord is the cell's, not the row's.
  const bob = grid.getByRole('row').filter({ hasText: 'bob@example.com' })
  await bob.getByRole('checkbox').check({ force: true })
  await bob.getByRole('gridcell', { name: 'bob@example.com' }).click()
  await page.keyboard.press('ControlOrMeta+c')
  await expect.poll(clipboard).toBe('bob@example.com')
  await bob.getByRole('gridcell', { name: 'Bob', exact: true }).hover()
  await bob.getByRole('button', { name: 'Copy name' }).click()
  await expect.poll(clipboard).toBe('Bob')
  await page.getByRole('button', { name: 'Clear selection' }).click()

  // What the picker leaves on screen is what every other copy takes.
  await page.getByRole('button', { name: /^Columns/u }).click()
  await page.getByRole('menuitemcheckbox', { name: 'name' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'role' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(fieldHeaders(grid)).toHaveCount(2)
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: 'Copy this page', exact: true }).click()
  await expect
    .poll(async () => {
      const copied = await clipboard()
      return copied.split('\n')[0]
    })
    .toBe('id\temail')
  await expect(page.getByRole('menu')).toHaveCount(0)

  // A row is still written whole, so the form brings back the columns that are folded away.
  await page.getByRole('button', { name: 'Add row' }).click()
  await expect(fieldHeaders(grid)).toHaveCount(4)
  await grid.getByRole('button', { name: 'Cancel' }).click()
  await expect(fieldHeaders(grid)).toHaveCount(2)
})

test('the keyboard opens an edit, and Escape throws it away', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText())
  await page.goto('/models/User?tab=data')
  const grid = page.getByRole('grid')
  const bob = grid.getByRole('row').filter({ hasText: 'bob@example.com' })
  const editor = grid.locator('input.cell-input')

  // Enter on the picked cell is the keyboard's pencil.
  await bob.getByRole('gridcell', { name: 'Bob', exact: true }).click()
  await page.keyboard.press('Enter')
  await expect(editor).toHaveValue('Bob')

  // What was typed and then abandoned never reaches the database.
  await editor.fill('Nope')
  await editor.press('Escape')
  await expect(editor).toHaveCount(0)
  await expect(bob).toContainText('Bob')
  await expect(bob).not.toContainText('Nope')
  await page.reload()
  await expect(grid.getByRole('row').filter({ hasText: 'bob@example.com' })).toContainText('Bob')
  await expect(grid).not.toContainText('Nope')

  // The arrow keys move the pick, and ⌘C follows it. Sideways, React Aria first walks the
  // picked cell's own two buttons, and ⌘C from one of them is still the cell's.
  await grid.getByRole('gridcell', { name: 'Bob', exact: true }).click()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ControlOrMeta+c')
  await expect.poll(clipboard).toBe('Ada')
  await page.keyboard.press('ArrowRight')
  const ada = grid.getByRole('row').filter({ hasText: 'ada@example.com' })
  await expect(ada.getByRole('button', { name: 'Copy name' })).toBeFocused()
  await page.keyboard.press('ControlOrMeta+c')
  await expect.poll(clipboard).toBe('Ada')
})

test('a click elsewhere saves the edit in progress', async ({ page }) => {
  await page.goto('/models/User?tab=data')
  const grid = page.getByRole('grid')
  const bob = grid.getByRole('row').filter({ hasText: 'bob@example.com' })
  const editor = grid.locator('input.cell-input')

  await bob.getByRole('gridcell', { name: 'Bob', exact: true }).hover()
  await bob.getByRole('button', { name: 'Edit name' }).click()
  await editor.fill('Rob')
  await grid.getByRole('gridcell', { name: 'ada@example.com' }).click()
  await expect(editor).toHaveCount(0)
  await expect(bob).toContainText('Rob')
  await page.reload()
  await expect(grid.getByRole('row').filter({ hasText: 'bob@example.com' })).toContainText('Rob')

  // Put Bob's name back for the other tests.
  await grid.getByRole('gridcell', { name: 'Rob', exact: true }).hover()
  await grid.getByRole('button', { name: 'Edit name' }).click()
  await editor.fill('Bob')
  await editor.press('Enter')
  await expect(grid).toContainText('Bob')
})

test('pages through a table larger than one page', async ({ page }) => {
  // A hundred and twenty more users, seeded behind Studio's back and taken away again after.
  const values = Array.from({ length: 120 }, (_, i) => {
    const n = String(i + 1).padStart(3, '0')
    return `('u${n}@paging.test', 'User ${n}', 'VIEWER')`
  })
  runSql(`INSERT INTO "User" ("email", "name", "role") VALUES ${values.join(', ')};`)
  try {
    await page.goto('/models/User?tab=data')
    const grid = page.getByRole('grid')
    await expect(page.getByText('1–100 of 123 rows · page 1 / 2')).toBeVisible()
    await expect(grid.getByRole('row')).toHaveCount(101)
    await expect(grid).toContainText('ada@example.com')

    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('101–123 of 123 rows · page 2 / 2')).toBeVisible()
    await expect(grid.getByRole('row')).toHaveCount(24)
    await expect(grid).toContainText('u120@paging.test')
    await expect(grid).not.toContainText('ada@example.com')

    await page.getByRole('button', { name: 'First page' }).click()
    await expect(page.getByText('1–100 of 123 rows · page 1 / 2')).toBeVisible()
    await page.getByRole('button', { name: 'Last page' }).click()
    await expect(page.getByText('101–123 of 123 rows · page 2 / 2')).toBeVisible()
    await page.getByRole('button', { name: 'Previous' }).click()
    await expect(page.getByText('1–100 of 123 rows · page 1 / 2')).toBeVisible()

    // A search starts over from the first page.
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByPlaceholder('Search every column…').fill('paging')
    await expect(page.getByText('1–100 of 120 rows · page 1 / 2')).toBeVisible()
  } finally {
    runSql(`DELETE FROM "User" WHERE "email" LIKE '%@paging.test';`)
  }
})

test('picks an enum value and clears an optional one back to NULL', async ({ page }) => {
  await page.goto('/models/User?tab=data')
  const grid = page.getByRole('grid')
  const bob = grid.getByRole('row').filter({ hasText: 'bob@example.com' })
  const cy = grid.getByRole('row').filter({ hasText: 'cy@example.com' })
  const select = grid.locator('select.cell-input')
  const input = grid.locator('input.cell-input')

  // An enum is edited from a list of its values, not typed.
  await bob.getByRole('gridcell', { name: 'VIEWER', exact: true }).hover()
  await bob.getByRole('button', { name: 'Edit role' }).click()
  await expect(select).toHaveValue('VIEWER')
  await select.selectOption('ADMIN')
  await select.press('Enter')
  await expect(select).toHaveCount(0)
  await expect(bob).toContainText('ADMIN')

  // An optional column takes a value, and an emptied editor puts NULL back.
  await expect(cy.getByRole('gridcell', { name: 'NULL' })).toBeVisible()
  await cy.getByRole('gridcell', { name: 'NULL' }).hover()
  await cy.getByRole('button', { name: 'Edit name' }).click()
  await expect(input).toHaveValue('')
  await input.fill('Cy')
  await input.press('Enter')
  await expect(cy).toContainText('Cy')
  await cy.getByRole('gridcell', { name: 'Cy', exact: true }).hover()
  await cy.getByRole('button', { name: 'Edit name' }).click()
  await input.fill('')
  await input.press('Enter')
  await expect(cy.getByRole('gridcell', { name: 'NULL' })).toBeVisible()

  // Put Bob's role back for the other tests.
  await bob.getByRole('gridcell', { name: 'ADMIN', exact: true }).hover()
  await bob.getByRole('button', { name: 'Edit role' }).click()
  await select.selectOption('VIEWER')
  await select.press('Enter')
  await expect(bob).toContainText('VIEWER')
})

test('folded-away columns stay folded across a reload', async ({ page }) => {
  await page.goto('/models/User?tab=data')
  const grid = page.getByRole('grid')
  const headers = fieldHeaders(grid)
  await expect(headers).toHaveCount(4)

  await page.getByRole('button', { name: /^Columns/u }).click()
  await page.getByRole('menuitemcheckbox', { name: 'name' }).click()
  await page.keyboard.press('Escape')
  await expect(headers).toHaveCount(3)
  await expect(grid).not.toContainText('Bob')

  await page.reload()
  await expect(fieldHeaders(grid)).toHaveCount(3)
  await expect(grid).toContainText('bob@example.com')
  await expect(grid).not.toContainText('Bob')

  // Showing it again is remembered the same way.
  await page.getByRole('button', { name: /^Columns/u }).click()
  await page.getByRole('menuitemcheckbox', { name: 'name' }).click()
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(fieldHeaders(grid)).toHaveCount(4)
  await expect(grid).toContainText('Bob')
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
