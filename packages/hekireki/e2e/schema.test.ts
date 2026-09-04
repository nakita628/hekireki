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
  // Two models and the enum one of them holds.
  const nodes = page.locator('.react-flow__node')
  await expect(nodes).toHaveCount(3)
  await expectTexts(nodes.filter({ hasText: 'User' }), ['id', 'email', 'name', 'role'])
  await expectTexts(nodes.filter({ hasText: 'Post' }), ['title', 'published', 'authorId'])
  // The relation, and the link from User.role to the Role card.
  await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  await expectLaidOut(page.locator('.react-flow'), { width: 600, height: 400 })
  await expectNoHorizontalOverflow(page)
})

test('the sidebar folds away to a rail and stays folded', async ({ page }) => {
  await page.goto('/')
  const sidebar = page.getByRole('complementary')
  await expect(sidebar).toBeVisible()

  await page.getByRole('button', { name: 'Hide the sidebar' }).click()
  await expect(sidebar).toBeHidden()
  const reopen = page.getByRole('button', { name: 'Show the sidebar' })
  await expect(reopen).toBeVisible()
  // The diagram keeps its place: the rail is all the sidebar leaves behind.
  await expect(page.locator('.react-flow')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: 'Show the sidebar' })).toBeVisible()
  await page.getByRole('button', { name: 'Show the sidebar' }).click()
  await expect(sidebar).toBeVisible()
})

test('the theme toggle switches the palette without breaking the layout', async ({ page }) => {
  await page.goto('/')
  const html = page.locator('html')
  await expect(html).not.toHaveClass(/dark/u)
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(html).toHaveClass(/dark/u)
  await expect(page.locator('.react-flow__node')).toHaveCount(3)
  await expectNoHorizontalOverflow(page)
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(html).not.toHaveClass(/dark/u)
})

test('a node carries a link to its page', async ({ page }) => {
  await page.goto('/')
  const nodes = page.locator('.react-flow__node')
  await expect(nodes).toHaveCount(3)

  // One click on the header link, the gesture nobody has to guess.
  await nodes.filter({ hasText: 'User' }).first().getByLabel('Open User').click()
  await expect(page).toHaveURL(/\/models\/User/u)
  await expect(page.getByRole('heading', { level: 1, name: 'User' })).toBeVisible()

  await page.goto('/')
  await page.locator('.react-flow__node-enum').first().getByLabel('Open Role').click()
  await expect(page).toHaveURL(/\/enums\/Role/u)

  // The link opens in a new tab the way any link does, rather than swallowing the modifier.
  await page.goto('/')
  const link = nodes.filter({ hasText: 'Post' }).first().getByLabel('Open Post')
  await expect(link).toHaveAttribute('href', '/models/Post')
})

test('a model page shows its fields and an enum page its values', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('complementary').getByRole('link', { name: /^User/u }).click()
  await expect(page).toHaveURL(/\/models\/User/u)
  await expect(page.getByRole('heading', { level: 1, name: 'User' })).toBeVisible()
  await page.getByRole('tab', { name: 'Fields' }).click()
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
  await expect(page.locator('.react-flow__node')).toHaveCount(3)
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
  await expect(page.locator('.react-flow__node')).toHaveCount(3)
  // The link opens the file with the error at its line.
  await page.getByRole('link', { name: 'Fix it in the editor' }).click()
  await expect(page).toHaveURL(/\/prisma/u)
  await expect(page.getByRole('tab', { selected: true })).toHaveText(/base\.prisma$/u)
  await expect(page.locator('.monaco-editor .squiggly-error').first()).toBeVisible()
  await expect(page.locator('.monaco-editor .current-line').first()).toBeVisible()
})
