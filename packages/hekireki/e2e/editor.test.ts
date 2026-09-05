// The Prisma page: Monaco backed by the Prisma language server through the Studio API.
import {
  editorOf,
  expect,
  expectLaidOut,
  expectNoHorizontalOverflow,
  expectTexts,
  fileOnDisk,
  resetSchema,
  test,
} from './studio.js'

test.beforeEach(async ({ page }) => {
  await page.goto('/prisma')
  await editorOf(page).ready()
})

test.afterEach(async ({ request }) => {
  await resetSchema(request)
})

test('shows the file, the other file as a tab and the diagram beside it', async ({ page }) => {
  const editor = editorOf(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Prisma schema' })).toBeVisible()
  await expect(page.getByText(/lines · sqlite/u)).toBeVisible()
  expect(await editor.lines()).toContain('model User {')
  await expect(page.getByRole('tab', { selected: true })).toHaveText(/base\.prisma$/u)
  await expect(page.getByRole('tab')).toHaveCount(2)
  await expectLaidOut(editor.root, { width: 400, height: 400 })
  await expectLaidOut(page.locator('.react-flow'), { width: 300, height: 400 })
  await expect(page.locator('.react-flow__node')).toHaveCount(3)
  await expectNoHorizontalOverflow(page)
})

test('highlights the model under the cursor in the diagram', async ({ page }) => {
  const editor = editorOf(page)
  await editor.goto(8, 3)
  await expect(page.locator('.react-flow__node.selected')).toHaveText(/User/u)
  await editor.goto(2, 3)
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(0)
})

test('marks an unknown type, offers the quick fixes and clears once fixed', async ({
  page,
  request,
}) => {
  const editor = editorOf(page)
  // `role  Role   @default(VIEWER)`: replace the type and its attribute.
  await editor.goto(11, 9)
  await page.keyboard.press('Shift+End')
  await editor.type('Rol')
  await expect(editor.root.locator('.squiggly-error')).toHaveCount(1)
  await expect(page.locator('header')).toContainText(/1 error · Type "Rol"/u)
  await expect.poll(() => fileOnDisk(request, 'base.prisma')).toContain('role  Rol')

  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Control+.')
  const actions = page.locator('.action-widget .monaco-list-row')
  await expect(actions).toHaveText([
    /Quick Fix/u,
    /Create new model 'Rol'/u,
    /Create new enum 'Rol'/u,
    /Change spelling to 'Role'/u,
  ])
  // The list takes the keyboard like VS Code: the first fix is selected, two down is the spelling.
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(editor.root.locator('.squiggly-error')).toHaveCount(0)
  await expect(page.locator('header')).not.toContainText('error')
  await expect.poll(() => fileOnDisk(request, 'base.prisma')).toContain('role  Role')
})

test('the space bar reaches the editor', async ({ page }) => {
  const editor = editorOf(page)
  await editor.goto(10, 1)
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await editor.type('nickname String?')
  // Monaco's experimental EditContext took the key and inserted nothing, so this read
  // `nicknameString?`; the textarea the editor is configured back onto does not.
  await expect.poll(() => editor.lines()).toContain('  nickname String?')
})

test('completes attributes from the language server', async ({ page }) => {
  const editor = editorOf(page)
  await editor.goto(12, 1)
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await editor.type('bio String @')
  const suggestions = page.locator('.suggest-widget.visible .monaco-list-row .label-name')
  await expect(suggestions.first()).toBeVisible()
  await expectTexts(page.locator('.suggest-widget.visible'), ['@unique', '@map', '@default'])
  await page.keyboard.press('Escape')
})

test('lists the blocks in the outline', async ({ page }) => {
  await editorOf(page).goto(1, 1)
  await page.keyboard.press('Control+Shift+O')
  const entries = page.locator('.quick-input-widget .monaco-list-row .label-name')
  await expect(entries).toHaveText(['db', 'User', 'Role'])
  await page.keyboard.press('Escape')
})

test('explains a relation on hover and jumps to its declaration in the other file', async ({
  page,
}) => {
  const editor = editorOf(page)
  // `posts Post[]`: the cursor on Post.
  await editor.goto(12, 10)
  await page.keyboard.press('Control+K')
  await page.keyboard.press('Control+I')
  const hover = page.locator('.monaco-hover-content').filter({ hasText: /\S/u }).first()
  await expect(hover).toContainText('model Post {')
  await expect(hover).toContainText('one-to-many')
  await page.keyboard.press('Escape')

  await page.keyboard.press('Shift+F12')
  const peek = page.locator('.reference-zone-widget')
  await expect(peek).toBeVisible()
  await expect(peek.locator('.peekview-title')).toContainText('2')
  await page.keyboard.press('Escape')

  await page.keyboard.press('F12')
  await expect(page.getByRole('tab', { selected: true })).toHaveText(/post\.prisma$/u)
  await expect.poll(() => editor.lines()).toContain('model Post {')
})

test('formats through the button and keeps the result on disk', async ({ page, request }) => {
  const editor = editorOf(page)
  await editor.goto(10, 1)
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await editor.type('nickname String?')
  await page.getByRole('button', { name: 'Format' }).click()
  await expect.poll(() => editor.lines()).toContain('  nickname String?')
  await expect
    .poll(() => fileOnDisk(request, 'base.prisma'))
    .toMatch(/nickname String\?\n {2}role {5}Role/u)
})

test('renames a model and keeps its table name', async ({ page, request }) => {
  const editor = editorOf(page)
  await editor.goto(6, 7)
  await page.keyboard.press('F2')
  const input = page.locator('.rename-box input')
  await expect(input).toBeVisible()
  await input.fill('Account')
  await input.press('Enter')
  await expect.poll(() => editor.lines()).toContain('model Account {')
  await expect.poll(() => fileOnDisk(request, 'base.prisma')).toContain('@@map("User")')
})
