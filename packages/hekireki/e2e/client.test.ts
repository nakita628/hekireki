import type { Page } from '@playwright/test'

import { expect, test } from './studio.js'

// The Prisma Client page on the client e2e/workspace.ts generated from the fixtures, with
// TypeScript 5 in the workspace: the call runs through Prisma Client itself, the SQL on the page
// is what it sent, and the editor completes against the types `prisma generate` wrote.

/** The query editor, emptied, with the text typed into it key by key (so brackets auto-close and overtype as they do for a user). */
async function typeQuery(page: Page, text: string) {
  const editor = page.locator('.monaco-editor').first()
  // The top left corner: a hover or a hint from before may cover the middle of the editor.
  await page.keyboard.press('Escape')
  await editor.locator('.view-lines').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Delete')
  await page.keyboard.type(text)
  await page.keyboard.press('Escape')
  return editor
}

/** The colour (and weight) a token of the editor is drawn in. */
async function colourOf(page: Page, text: string | RegExp) {
  const token = page
    .locator('.monaco-editor .view-line span span')
    .filter({ hasText: typeof text === 'string' ? new RegExp(`^${text}$`, 'u') : text })
    .first()
  return token.evaluate((node) => globalThis.getComputedStyle(node).color)
}

/** The text of the query editor, as the user sees it. */
async function editorText(page: Page) {
  const text = await page.locator('.monaco-editor .view-lines').first().innerText()
  return text.replaceAll('\u00A0', ' ')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Prisma Client' }).click()
  await expect(page).toHaveURL(/\/client$/u)
  await expect(page.getByRole('heading', { level: 1, name: 'Prisma Client' })).toBeVisible()
  await expect(page.getByText(/^\.\.\/generated\/client · sqlite/u)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled()
})

test('runs a call and shows its rows and the SQL Prisma Client sent, which opens on the SQL page', async ({
  page,
}) => {
  await typeQuery(
    page,
    'prisma.user.findMany({ where: { role: "VIEWER" }, orderBy: { id: "asc" } })',
  )
  await page.keyboard.press('ControlOrMeta+Enter')

  const grid = page.getByRole('grid', { name: 'Query result' })
  await expect(grid).toContainText('bob@example.com')
  await expect(grid).toContainText('cy@example.com')
  await expect(grid).not.toContainText('ada@example.com')
  await expect(page.getByText(/^2 rows · .+ · 1 statement$/u)).toBeVisible()

  await page.getByRole('tab', { name: /^SQL/u }).click()
  const statement = page.locator('pre').filter({ hasText: 'FROM `main`.`User`' })
  // Laid out a clause per line by default; the text itself is Prisma's.
  await expect(statement).toContainText(/^SELECT\n {2}`main`\.`User`\.`id`,/u)
  await expect(statement).toContainText('\nFROM `main`.`User`\nWHERE `main`.`User`.`role` = ?\n')
  // The value bound to the placeholder, as Prisma Client logged it.
  await expect(page.locator('.pill').filter({ hasText: '?1' })).toHaveText('?1"VIEWER"')
  await page.getByRole('button', { name: 'As sent' }).click()
  await expect(statement).toContainText(
    /^SELECT `main`\.`User`\.`id`, .+ FROM `main`\.`User` WHERE /u,
  )

  await page.getByRole('button', { name: 'Formatted' }).click()
  await page.getByRole('button', { name: 'Open in SQL' }).click()
  await expect(page).toHaveURL(/\/sql\?/u)
  await expect(page.locator('.cm-content')).toContainText('FROM `main`.`User`')
  // The value Prisma bound goes to the placeholder, so the statement runs as it did there.
  const role = page.getByLabel('Parameter ?').filter({ hasText: '.`role` = ?' })
  await expect(role.getByRole('textbox')).toHaveValue('VIEWER')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.getByRole('grid', { name: 'Query result' })).toContainText('bob@example.com')
})

test('completes, colours and checks the call against the types prisma generate wrote', async ({
  page,
}) => {
  const editor = await typeQuery(page, 'prisma.user.findMany({ where: { ')
  await page.keyboard.press('ControlOrMeta+Space')
  const suggestions = page.locator('.suggest-widget')
  // The fields of the model and the combinators of UserWhereInput, from the generated client.
  await expect(suggestions).toContainText('email')
  await expect(suggestions).toContainText('posts')
  await expect(suggestions).toContainText('AND')
  await page.keyboard.press('Escape')

  await page.keyboard.type('nope: 1')
  await expect(
    page.getByRole('button', { name: /'nope' does not exist in type 'UserWhereInput'/u }),
  ).toBeVisible()
  await expect(editor.locator('.squiggly-error').first()).toBeVisible()

  // The client, the operation and an argument key each have a colour of their own (light theme).
  await expect.poll(() => colourOf(page, 'prisma')).toBe('rgb(180, 83, 9)')
  await expect.poll(() => colourOf(page, 'findMany')).toBe('rgb(3, 105, 161)')
  await expect.poll(() => colourOf(page, 'where')).toBe('rgb(15, 118, 110)')
})

test('asks before a write, and runs it only once it is confirmed', async ({ page }) => {
  await typeQuery(page, 'prisma.post.updateMany({ where: { id: -1 }, data: { title: "x" } })')
  await expect(page.getByText('Post.updateMany · write')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+Enter')

  const dialog = page.getByRole('alertdialog', { name: 'Run a write?' })
  await expect(dialog).toContainText('Post.updateMany')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Run the call to see what it returns')).toBeVisible()

  await page.locator('.monaco-editor .view-lines').click()
  await page.keyboard.press('ControlOrMeta+Enter')
  await dialog.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(dialog).toBeHidden()
  // No post has id -1: the write touches nothing, and says so.
  await expect(page.getByRole('grid', { name: 'Query result' })).toContainText('count')
  await page.getByRole('tab', { name: /^SQL/u }).click()
  await expect(page.locator('pre').filter({ hasText: 'UPDATE `main`.`Post`' })).toBeVisible()
})

test('shows a single value as JSON, and rows as a table or as JSON', async ({ page }) => {
  await typeQuery(page, 'prisma.user.count()')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.getByText(/^one value · .+ · 1 statement$/u)).toBeVisible()
  await expect(page.locator('pre').filter({ hasText: /^3$/u })).toBeVisible()
  await expect(page.getByRole('button', { name: 'JSON' })).toBeHidden()

  await typeQuery(page, 'prisma.user.findMany({ orderBy: { id: "asc" }, take: 2 })')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.getByRole('grid', { name: 'Query result' })).toContainText('ada@example.com')
  await page.getByRole('button', { name: 'JSON' }).click()
  const json = page.locator('pre').filter({ hasText: '"email": "ada@example.com"' })
  await expect(json).toContainText('"email": "bob@example.com"')
  await expect(json).not.toContainText('cy@example.com')
  await page.getByRole('button', { name: 'Table' }).click()
  await expect(page.getByRole('grid', { name: 'Query result' })).toBeVisible()
})

test('colours every part of a call, and the SQL Prisma Client sent', async ({ page }) => {
  await typeQuery(
    page,
    'await prisma.user.findMany({ where: { name: "Ann", id: 42, email: null }, cursor: new Date(0) }) // note',
  )
  // The light theme's palette (monaco.ts): each kind of token has a colour of its own.
  await expect.poll(() => colourOf(page, 'await')).toBe('rgb(79, 70, 229)')
  await expect.poll(() => colourOf(page, 'prisma')).toBe('rgb(180, 83, 9)')
  await expect.poll(() => colourOf(page, 'user')).toBe('rgb(22, 24, 31)')
  await expect.poll(() => colourOf(page, 'findMany')).toBe('rgb(3, 105, 161)')
  await expect.poll(() => colourOf(page, 'where')).toBe('rgb(15, 118, 110)')
  await expect.poll(() => colourOf(page, /^"?Ann"?$/u)).toBe('rgb(21, 128, 61)')
  await expect.poll(() => colourOf(page, '42')).toBe('rgb(14, 116, 144)')
  await expect.poll(() => colourOf(page, 'null')).toBe('rgb(79, 70, 229)')
  await expect.poll(() => colourOf(page, 'Date')).toBe('rgb(22, 24, 31)')
  await expect.poll(() => colourOf(page, /^\/\/\snote$/u)).toBe('rgb(154, 159, 179)')

  await typeQuery(page, 'prisma.user.findMany({ take: 1 })')
  await page.keyboard.press('ControlOrMeta+Enter')
  await page.getByRole('tab', { name: /^SQL/u }).click()
  const statement = page.locator('pre').filter({ hasText: 'FROM `main`.`User`' })
  await expect(statement.locator('.tok-keyword').first()).toHaveText('SELECT')
})

test('explains the call: the type under the pointer, the signature being filled in, the detail of a completion', async ({
  page,
}) => {
  await typeQuery(page, 'prisma.user.findMany()')
  const operation = page
    .locator('.monaco-editor .view-line span span')
    .filter({ hasText: /^findMany$/u })
  const hover = page.locator('.monaco-hover').filter({ hasText: /\S/u }).first()
  // The first answer waits for the language service to load: point again until it is there.
  await expect(async () => {
    await page.mouse.move(0, 0)
    await operation.hover()
    await expect(hover).toContainText('PrismaPromise', { timeout: 2000 })
  }).toPass()
  await expect(hover).toContainText('Find zero or more Users')

  await typeQuery(page, 'prisma.post.create(')
  await expect(page.locator('.parameter-hints-widget')).toContainText('data: XOR<PostCreateInput')

  await typeQuery(page, 'prisma.user.findMany({ where: { em')
  await page.keyboard.press('ControlOrMeta+Space')
  await expect(page.locator('.suggest-widget')).toContainText('email')
  await expect(page.locator('.suggest-widget')).toContainText('StringFilter')
})

test('points the editor at a problem when it is clicked', async ({ page }) => {
  await typeQuery(page, 'prisma.user.findMany({ where: { id } })')
  const problem = page.getByRole('button', { name: /"id" is a variable/u })
  await expect(problem).toBeVisible()
  await problem.click()
  // The range of the problem is selected: typing replaces exactly it.
  await page.keyboard.type('email')
  await expect.poll(() => editorText(page)).toBe('prisma.user.findMany({ where: { email } })')
})

test('opens from the palette', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^Search the schema/u })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  const dialog = page.getByRole('dialog', { name: 'Search the schema' })
  await dialog.getByRole('searchbox').fill('prisma client')
  await expect(dialog.getByRole('option').first()).toContainText('Prisma Client')
  await dialog.getByRole('searchbox').press('Enter')
  await expect(page).toHaveURL(/\/client$/u)
})

test('updates the row counts of the sidebar after a write, and after undoing it', async ({
  page,
}) => {
  const posts = page.getByRole('link', { name: /^Post \d+$/u })
  const countOf = async () => {
    const label = await posts.innerText()
    return Number(label.replaceAll(/\D/gu, ''))
  }
  await expect(posts).toBeVisible()
  const before = await countOf()

  const run = async (query: string) => {
    await typeQuery(page, query)
    await page.keyboard.press('ControlOrMeta+Enter')
    const dialog = page.getByRole('alertdialog', { name: 'Run a write?' })
    await dialog.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(dialog).toBeHidden()
  }
  await run('prisma.post.create({ data: { title: "e2e write", authorId: 1 } })')
  await expect.poll(countOf).toBe(before + 1)
  await run('prisma.post.deleteMany({ where: { title: "e2e write" } })')
  await expect.poll(countOf).toBe(before)
})

test.describe('when a call is refused', () => {
  // The refused request is a 422 the browser logs; it is what these tests are about.
  test.use({ expectedProblems: [/422 \(Unprocessable Entity\)/u] })

  test('shows what Prisma Client said, not the status line', async ({ page }) => {
    await typeQuery(page, 'prisma.user.findMany({ where: { nope: 1 } })')
    await page.keyboard.press('ControlOrMeta+Enter')
    const error = page.locator('pre.error-box')
    await expect(error).toContainText('Unknown argument `nope`')
    await expect(error).not.toContainText('422')
  })

  test('shows why the text could not be read, before it reached Prisma Client', async ({
    page,
  }) => {
    await typeQuery(page, 'prisma.user.findMany({ where: { id } })')
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(page.locator('pre.error-box')).toHaveText(
      '"id" is a variable: write "id: <value>"',
    )
  })
})
