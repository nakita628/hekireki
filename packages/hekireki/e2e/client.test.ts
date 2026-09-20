import type { Locator, Page } from '@playwright/test'

import { expect, expectNoHorizontalOverflow, test } from './studio.js'

// The Prisma Client page on the client e2e/workspace.ts generated from the fixtures, with
// TypeScript 5 in the workspace: the call runs through Prisma Client itself, the SQL on the page
// is what it sent, and the editor completes against the types `prisma generate` wrote.

/** The query editor, emptied, with the text typed into it key by key (so brackets auto-close and overtype as they do for a user). */
async function typeQuery(page: Page, text: string) {
  const editor = page.locator('.monaco-editor').first()
  // Focused rather than clicked: a hover or a hint from before may cover the editor, and a long
  // line scrolls its text out from under any fixed point.
  await page.keyboard.press('Escape')
  await editor.getByRole('textbox').focus()
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

/** Holds the page's requests to the Studio API path until the returned function lets them through. */
async function hold(page: Page, path: string) {
  const gate = Promise.withResolvers()
  await page.route(`**/api${path}`, async (route) => {
    await gate.promise
    await route.continue()
  })
  return () => {
    gate.resolve(null)
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Prisma Client' }).click()
  await expect(page).toHaveURL(/\/client$/u)
  await expect(page.getByRole('heading', { level: 1, name: 'Prisma Client' })).toBeVisible()
  await expect(page.getByText(/^1 lines · \.\.\/generated\/client · sqlite/u)).toBeVisible()
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

  // The SQL tab shows what the run sent.
  await page.getByRole('tab', { name: /^SQL · 1$/u }).click()
  const statement = page.locator('pre').filter({ hasText: 'FROM `main`.`User`' })
  // Laid out a clause per line by default; the text itself is Prisma's.
  await expect(statement).toContainText(/^SELECT\n {2}`main`\.`User`\.`id`,/u)
  await expect(statement).toContainText(
    '\nFROM\n  `main`.`User`\nWHERE\n  `main`.`User`.`role` = ?\n',
  )
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

test('says in the editor that the text is being read and checked, then what was found', async ({
  page,
}) => {
  const state = page.getByRole('status', { name: 'Editor status' })
  // The reading, then TypeScript's check, each held back so the page is seen waiting on it.
  const analyzed = await hold(page, '/client/analyze')
  const checked = await hold(page, '/client/check')
  await typeQuery(page, 'prisma.user.count()')
  await expect(state).toHaveText('Analyzing…')
  analyzed()
  await expect(state).toHaveText('Checking types…')
  checked()
  await expect(state).toHaveText('No problems')

  await typeQuery(page, 'prisma.user.findMany({ where: { nope: 1 } })')
  await expect(state).toHaveText('1 problem')
})

test('says the call is running, then what it came back with', async ({ page }) => {
  const state = page.getByRole('status', { name: 'Run status' })
  const ran = await hold(page, '/client/run')
  await typeQuery(page, 'prisma.user.count()')
  await expect(page.getByRole('status', { name: 'Editor status' })).toHaveText('No problems')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(state).toHaveText('Running…')
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeDisabled()
  ran()
  await expect(state).toHaveText(/^one value · .+ · 1 statement$/u)
})

test('shows the SQL as the call is written, the result once it runs, and a write’s SQL only after it has run', async ({
  page,
}) => {
  const previewed: string[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/api/client/preview')) previewed.push(request.postData() ?? '')
  })
  const sqlTab = page.getByRole('tab', { name: /^SQL/u })
  const resultTab = page.getByRole('tab', { name: 'Result' })
  const state = page.getByRole('status', { name: 'SQL status' })
  const statement = page.locator('pre').filter({ hasText: 'FROM' })
  // Writing the call brings its SQL into view, without a click.
  await typeQuery(page, 'prisma.user.findMany({ where: { role: "VIEWER" } })')
  await expect(sqlTab).toHaveAttribute('aria-selected', 'true')
  await expect(statement).toContainText(
    '\nFROM\n  `main`.`User`\nWHERE\n  `main`.`User`.`role` = ?\n',
  )
  await expect(state).toHaveText(/^1 statement · .+ ms$/u)

  const updated = await hold(page, '/client/preview')
  await typeQuery(page, 'prisma.user.findMany({ where: { role: "ADMIN" } })')
  await expect(state).toHaveText('Updating…')
  updated()
  await expect(page.locator('.pill').filter({ hasText: '?1' })).toHaveText('?1"ADMIN"')

  // Running it brings the result; writing again, the SQL.
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(resultTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('grid', { name: 'Query result' })).toContainText('ada@example.com')
  await typeQuery(page, 'prisma.post.count()')
  await expect(sqlTab).toHaveAttribute('aria-selected', 'true')
  await expect(statement).toContainText('`main`.`Post`')

  // While the text has a problem, what the call last sent stays, stepped back.
  await typeQuery(page, 'prisma.post.count({ where: { nope: 1 } })')
  await expect(
    page.getByText('Fix the problems to update the SQL: this is what the call last sent.'),
  ).toBeVisible()
  await expect(statement).toContainText('`main`.`Post`')

  // A write is not run for its SQL: it shows once the write has run, after it is confirmed.
  await typeQuery(page, 'prisma.post.updateMany({ where: { id: -1 }, data: { title: "x" } })')
  await expect(page.getByText('A write shows its SQL when it is run.')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+Enter')
  const dialog = page.getByRole('alertdialog', { name: 'Run a write?' })
  await dialog.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.getByRole('grid', { name: 'Query result' })).toContainText('count')
  await sqlTab.click()
  await expect(page.locator('pre').filter({ hasText: 'UPDATE `main`.`Post`' })).toBeVisible()
  expect(previewed.filter((body) => body.includes('updateMany'))).toStrictEqual([])
})

test('shows the SQL the run sent for the text it ran, without waiting on a preview', async ({
  page,
}) => {
  // No preview answers until the end: what the SQL tab shows after the run is the run's own.
  const answered = await hold(page, '/client/preview')
  await typeQuery(page, 'prisma.user.findMany({ where: { role: "ADMIN" } })')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.getByRole('grid', { name: 'Query result' })).toContainText('ada@example.com')
  await page.getByRole('tab', { name: 'SQL · 1' }).click()
  await expect(page.locator('.pill').filter({ hasText: '?1' })).toHaveText('?1"ADMIN"')
  await expect(page.getByRole('status', { name: 'SQL status' })).toHaveText(
    /^1 statement · .+ ms$/u,
  )
  answered()
})

test('lights up the models the call touches in the schema beside it, and marks the fields it names', async ({
  page,
}) => {
  const schema = page.locator('.react-flow')
  await expect(
    page.getByText('Every model; the ones a call touches light up as you type.'),
  ).toBeVisible()
  await typeQuery(
    page,
    'prisma.user.findMany({ where: { role: "VIEWER" }, include: { posts: { select: { title: true } } } })',
  )
  await expect(
    page.getByText('2 models touched · the fields the call names are marked'),
  ).toBeVisible()
  await expect(schema.getByTitle('Read by the statement')).toHaveCount(2)

  // Another call, another model: User steps back.
  await typeQuery(page, 'prisma.post.count({ where: { published: true } })')
  await expect(
    page.getByText('1 model touched · the fields the call names are marked'),
  ).toBeVisible()
  await expect(schema.getByTitle('Read by the statement')).toHaveCount(1)
})

test('keeps a wide result inside its pane when the pane is narrowed, scrolling it instead', async ({
  page,
}) => {
  await typeQuery(page, 'prisma.user.findMany({ include: { posts: true } })')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.getByRole('grid', { name: 'Query result' })).toContainText('ada@example.com')

  // Narrowed after the result is drawn: the pane shrinks around the table, which scrolls.
  const handle = page.getByRole('button', { name: 'Resize the schema' })
  await handle.press('Home')
  const rightOf = async (locator: Locator) => {
    const box = await locator.boundingBox()
    return box === null ? Number.POSITIVE_INFINITY : box.x + box.width
  }
  const split = await handle.boundingBox()
  const edge = split?.x ?? 0
  expect(edge).toBeGreaterThan(0)
  for (const locator of [
    page.getByRole('status', { name: 'Run status' }),
    page.locator('.table__scroll-container'),
    page.getByText(/^1 lines · /u),
  ]) {
    await expect.poll(() => rightOf(locator)).toBeLessThanOrEqual(edge)
  }
  await expectNoHorizontalOverflow(page)
})

test('asks before a write, and runs it only once it is confirmed', async ({ page }) => {
  await typeQuery(page, 'prisma.post.updateMany({ where: { id: -1 }, data: { title: "x" } })')
  await expect(page.getByText('Post.updateMany · write')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+Enter')

  const dialog = page.getByRole('alertdialog', { name: 'Run a write?' })
  await expect(dialog).toContainText('Post.updateMany')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('tab', { name: 'Result' }).click()
  await expect(page.getByText('Run the call to see what it returns')).toBeVisible()

  await page.locator('.monaco-editor').first().getByRole('textbox').focus()
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
  await page.getByRole('tab', { name: /^SQL · 1$/u }).click()
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

test('formats the call from the button and from the keyboard, as VS Code would', async ({
  page,
}) => {
  await typeQuery(
    page,
    'prisma.user.findMany({where:{role:"VIEWER"},orderBy:{id:"asc"},include:{posts:{where:{published:true}}},take:2})',
  )
  await page.getByRole('button', { name: 'Format' }).click()
  // Longer than the formatter's line, so it breaks the argument out, one key per line.
  await expect.poll(() => editorText(page)).toBe(`prisma.user.findMany({
  where: { role: 'VIEWER' },
  orderBy: { id: 'asc' },
  include: { posts: { where: { published: true } } },
  take: 2,
})`)

  await typeQuery(page, 'prisma.post.count({where:{published:true}})')
  await page.keyboard.press('Shift+Alt+F')
  await expect
    .poll(() => editorText(page))
    .toBe('prisma.post.count({ where: { published: true } })')
  // The formatted text runs as the typed one did.
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.locator('pre').filter({ hasText: /^2$/u })).toBeVisible()
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

  test('shows in the SQL tab what Prisma Client said when a read it previews throws', async ({
    page,
  }) => {
    // TypeScript has nothing against it; only the database knows there is no such row.
    await typeQuery(page, 'prisma.user.findUniqueOrThrow({ where: { id: 999 } })')
    await expect(page.getByRole('tab', { name: /^SQL/u })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('pre.error-box')).toContainText(/No record was found/u)
    await expect(page.getByRole('status', { name: 'SQL status' })).toBeEmpty()
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
