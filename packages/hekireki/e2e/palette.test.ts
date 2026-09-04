import { expect, test } from './studio.js'

test('the shortcut opens the palette and Enter follows the highlighted entry', async ({ page }) => {
  await page.goto('/')
  // The chord is bound once the app has mounted, which the sidebar's own button reports.
  await expect(page.getByRole('button', { name: /^Search the schema/u })).toBeVisible()
  const dialog = page.getByRole('dialog', { name: 'Search the schema' })
  await expect(dialog).toBeHidden()

  await page.keyboard.press('ControlOrMeta+k')
  await expect(dialog).toBeVisible()
  // The browser hands the modal its first focusable element, which is the box to type in.
  const box = dialog.getByRole('searchbox')
  await expect(box).toBeFocused()

  await box.fill('post')
  // The exact name outranks the pages and the fields it also matches.
  await expect(dialog.getByRole('option').first()).toContainText('Post')
  await box.press('Enter')

  await expect(page).toHaveURL(/\/models\/Post/u)
  await expect(page.getByRole('heading', { level: 1, name: 'Post' })).toBeVisible()
  await expect(dialog).toBeHidden()
})

test('the sidebar button opens the palette and Escape closes it again', async ({ page }) => {
  await page.goto('/')
  const dialog = page.getByRole('dialog', { name: 'Search the schema' })

  await page.getByRole('button', { name: /^Search the schema/u }).click()
  await expect(dialog).toBeVisible()

  // Escape leaves, whether or not something has been typed into the box.
  await dialog.getByRole('searchbox').fill('user')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/$/u)
})

test('the palette matches letters in order and reaches enums and pages', async ({ page }) => {
  await page.goto('/')
  // The chord is bound once the app has mounted, which the sidebar's own button reports.
  await expect(page.getByRole('button', { name: /^Search the schema/u })).toBeVisible()
  const dialog = page.getByRole('dialog', { name: 'Search the schema' })

  // Not a substring of any name: `Role` is found by its first and last letter.
  await page.keyboard.press('ControlOrMeta+k')
  await dialog.getByRole('searchbox').fill('re')
  await expect(dialog.getByRole('option').first()).toContainText('Role')
  await dialog.getByRole('searchbox').press('Enter')
  await expect(page).toHaveURL(/\/enums\/Role/u)

  await page.keyboard.press('ControlOrMeta+k')
  await dialog.getByRole('searchbox').fill('docs')
  await dialog.getByRole('searchbox').press('Enter')
  await expect(page).toHaveURL(/\/docs/u)
})

test('the palette reaches a field and opens its model on it', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^Search the schema/u })).toBeVisible()
  const dialog = page.getByRole('dialog', { name: 'Search the schema' })

  // A field is written under its model, so the model's letters narrow to that model's fields.
  await page.keyboard.press('ControlOrMeta+k')
  await dialog.getByRole('searchbox').fill('usemail')
  await expect(dialog.getByRole('option').first()).toContainText('User.email')
  await dialog.getByRole('searchbox').press('Enter')

  // Both search parameters, in whichever order the router wrote them.
  await expect(page).toHaveURL(/\/models\/User\?(?=.*tab=fields)(?=.*field=email)/u)
  // The fields tab, opened on the row that was asked for and pointing at it.
  const row = page.getByRole('row').filter({ hasText: 'Login address' })
  await expect(row.getByRole('cell').nth(1)).toHaveText('email')
  await expect(row).toHaveClass(/bg-accent-soft/u)
})

test('the arrow keys move the highlight and a query with no match says so', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^Search the schema/u })).toBeVisible()
  const dialog = page.getByRole('dialog', { name: 'Search the schema' })
  await page.keyboard.press('ControlOrMeta+k')
  const box = dialog.getByRole('searchbox')

  // Typing stands the list on its best match; one press down moves to the next, and Enter follows
  // whichever one it is standing on. `Post` outranks the fields under it, and `Post.id` is the
  // shortest of those.
  await box.fill('post')
  await expect(dialog.getByRole('option').first()).toContainText('Post')
  await box.press('ArrowDown')
  await box.press('Enter')
  await expect(page).toHaveURL(/\/models\/Post\?(?=.*tab=fields)(?=.*field=id)/u)

  await page.keyboard.press('ControlOrMeta+k')
  const again = dialog.getByRole('searchbox')
  await again.fill('zzz')
  await expect(dialog).toContainText('Nothing matches')
  // Enter on nothing is not a navigation.
  await again.press('Enter')
  await expect(page).toHaveURL(/\/models\/Post/u)
})
