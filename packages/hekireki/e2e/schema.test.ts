import {
  expect,
  expectLaidOut,
  expectNoHorizontalOverflow,
  expectTexts,
  loadedFiles,
  resetSchema,
  test,
} from './studio.js'

test.afterEach(async ({ request }) => {
  await resetSchema(request)
})

test('the schema page lays out the sidebar and the diagram', async ({ page }) => {
  await page.goto('/')
  const sidebar = page.getByRole('complementary')
  await expect(sidebar.getByText('Models · 2')).toBeVisible()
  await expect(sidebar.getByRole('link', { name: /User/u })).toBeVisible()
  await expect(sidebar.getByRole('link', { name: /Post/u })).toBeVisible()
  await expect(sidebar.getByText('Enums · 1')).toBeVisible()
  await expect(sidebar.getByText(/sqlite ·/u)).toBeVisible()
  await expect(sidebar.getByText(/Watching ·/u)).toBeVisible()

  await expect(page.getByRole('heading', { level: 1, name: 'Schema' })).toBeVisible()
  await expect(page.getByText('2 models · 1 relation · 1 enums')).toBeVisible()
  const nodes = page.locator('.react-flow__node')
  await expect(nodes).toHaveCount(2)
  await expectTexts(nodes.filter({ hasText: 'User' }), ['id', 'email', 'name', 'role'])
  await expectTexts(nodes.filter({ hasText: 'Post' }), ['title', 'published', 'authorId'])
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await expectLaidOut(page.locator('.react-flow'), { width: 600, height: 400 })
  await expectNoHorizontalOverflow(page)
})

test('the theme toggle switches the palette without breaking the layout', async ({ page }) => {
  await page.goto('/')
  const html = page.locator('html')
  await expect(html).not.toHaveClass(/dark/u)
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(html).toHaveClass(/dark/u)
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  await expectNoHorizontalOverflow(page)
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(html).not.toHaveClass(/dark/u)
})

test('a model page shows its fields and an enum page its values', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('complementary').getByRole('link', { name: /^User/u }).click()
  await expect(page).toHaveURL(/\/models\/User/u)
  await expect(page.getByRole('heading', { level: 1, name: 'User' })).toBeVisible()
  await page.getByRole('link', { name: 'Fields' }).click()
  const table = page.getByRole('table')
  await expectTexts(table, ['id', 'email', 'name', 'role', 'posts'])
  await expect(table).toContainText('Login address')
  await expectNoHorizontalOverflow(page)

  await page.getByRole('complementary').getByRole('link', { name: /^Role/u }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Role' })).toBeVisible()
  await expectTexts(page.getByRole('table'), ['ADMIN', 'VIEWER'])
})

test('the docs page renders every model and links its sections', async ({ page }) => {
  await page.goto('/docs')
  const article = page.locator('article')
  await expectLaidOut(article, { width: 400, height: 300 })
  await expectTexts(article, ['User', 'Post', 'Role'])
  await expect(article.locator('h2, h3').first()).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('a broken schema keeps the last diagram and points at the editor', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  const files = await loadedFiles(request)
  const base = files.find((file) => file.path.endsWith('base.prisma'))
  if (base === undefined) throw new Error('base.prisma is not loaded')
  await request.put('/api/schema/files', {
    data: { path: base.path, content: base.content.replace('name  String?', 'name  Nope?') },
  })
  const banner = page.getByText(/1 error/u).first()
  await expect(banner).toBeVisible()
  await expect(page.getByText(/Type "Nope" is neither a built-in type/u).first()).toBeVisible()
  // The diagram is the last valid one and still there.
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  // The link opens the file with the error at its line.
  await page.getByRole('link', { name: 'Fix it in the editor' }).click()
  await expect(page).toHaveURL(/\/prisma/u)
  await expect(page.locator('.tab-active')).toHaveText(/base\.prisma$/u)
  await expect(page.locator('.monaco-editor .squiggly-error').first()).toBeVisible()
  await expect(page.locator('.monaco-editor .current-line').first()).toBeVisible()
})
