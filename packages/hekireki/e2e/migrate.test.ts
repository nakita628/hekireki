// The Migrate page against the SQLite workspace database, which has never been migrated: no
// migrations directory and no `_prisma_migrations`, which is what a project that reached for
// `db push` looks like.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  expect,
  expectNoHorizontalOverflow,
  fileOnDisk,
  loadedFiles,
  resetSchema,
  test,
} from './studio.js'
import { SCHEMA_DIR } from './workspace.js'

// What the page keeps beside the schema outlives a test, as it outlives a session: every test
// starts from nothing decided.
test.afterEach(async ({ request }) => {
  await request.put('/api/migrate/decisions', { data: { decisions: [] } })
})

/** Rewrites one schema file of the workspace, the way the editor saves it. */
async function writeSchema(
  request: Parameters<typeof loadedFiles>[0],
  name: string,
  change: (content: string) => string,
) {
  const files = await loadedFiles(request)
  const file = files.find((one) => one.path.endsWith(name))
  expect(file).toBeDefined()
  const response = await request.put('/api/schema/files', {
    data: { path: file?.path ?? '', content: change(file?.content ?? '') },
  })
  expect(response.ok()).toBe(true)
}

test('the migrate page reports a history that is not there yet', async ({ page }) => {
  await page.goto('/migrate')
  await expect(page.getByRole('heading', { level: 1, name: 'Migrate' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'History' })).toBeVisible()
  // The workspace keeps no migrations, and the page says so rather than showing an empty table.
  await expect(page.getByText(/No migrations in .*migrations\.$/u)).toBeVisible()
  await expect(page.getByRole('table')).toBeHidden()
  // Nothing to deploy, so the button that would is not offered.
  await expect(page.getByRole('button', { name: /Deploy/u })).toBeHidden()
  await expectNoHorizontalOverflow(page)
})

test('the sidebar links to the page and marks it as the one open', async ({ page }) => {
  await page.goto('/')
  const link = page.getByRole('complementary').getByRole('link', { name: 'Migrate' })
  await expect(link).toBeVisible()
  await link.click()
  await expect(page).toHaveURL(/\/migrate$/u)
  await expect(page.getByRole('heading', { level: 1, name: 'Migrate' })).toBeVisible()
})

test('the page compares the schema with the database as it opens, and lays out the steps', async ({
  page,
}) => {
  await page.goto('/migrate')
  // Nobody has to ask for the comparison: the page opens on it.
  const changes = page.getByRole('heading', { level: 2, name: 'What the schema changes' })
  const upToDate = page.getByText('The database already matches the schema')
  await expect(changes.or(upToDate)).toBeVisible()
  if (await upToDate.isVisible()) return

  await expect(page.getByRole('heading', { level: 2, name: 'Check the result' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Run the migration' })).toBeVisible()
  const steps = page.locator('ol > li')
  await expect(steps.first()).toBeVisible()
  // The steps are shown for review; they run from the one button, or one at a time on request.
  await expect(steps.first().getByRole('button', { name: /^Run/u })).toHaveCount(0)
  await page.getByRole('button', { name: 'Run one step at a time' }).click()
  await expect(steps.last().getByRole('button', { name: /^Run/u })).toBeVisible()
  // Nothing has run, so there is nothing to record yet.
  await expect(page.getByRole('button', { name: 'Record as applied' })).toBeDisabled()
  await expectNoHorizontalOverflow(page)
})

test('a step that loses rows asks before it runs', async ({ page, request }) => {
  // The schema loses the `Post` model, both sides of it: the migration for that drops the table
  // and every row in it, which is a step no rebuild can make safe.
  await writeSchema(request, 'base.prisma', (content) =>
    content.replace(/^\s*posts\s+Post\[\]\s*$/mu, ''),
  )
  await writeSchema(request, 'post.prisma', (content) =>
    content.replace(/\/\/\/ A blog post[\s\S]*?\n\}\n/u, ''),
  )
  await expect.poll(() => fileOnDisk(request, 'post.prisma')).not.toContain('model Post')

  await page.goto('/migrate')
  await expect(page.getByText('Drops the table Post, and every row in it').first()).toBeVisible()
  await page.getByRole('button', { name: 'Run one step at a time' }).click()
  const destructive = page.locator('ol > li', { hasText: 'loses data' }).last()
  await expect(destructive).toBeVisible()

  // A step that loses data runs only once the migration has been rehearsed.
  await expect(destructive.getByRole('button', { name: /^Run/u })).toBeDisabled()
  await page.getByRole('button', { name: 'Rehearse the migration' }).click()
  await expect(page.getByText('The rehearsal went through')).toBeVisible({ timeout: 15_000 })

  // Pressing Run on it asks first; nothing reaches the database until that is answered.
  await destructive.getByRole('button', { name: /^Run/u }).click()
  await expect(page.getByText('Run steps that lose data?')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText('Run steps that lose data?')).toBeHidden()
  // The table is still there: the question was the whole of what the press did.
  const still = await request.post('/api/db/sql', {
    data: { sql: 'SELECT count(*) AS n FROM "Post"' },
  })
  expect(still.ok()).toBe(true)

  await resetSchema(request)
})

test('a check that blocks says what it asks, suggests an answer, and holds back the run', async ({
  page,
  request,
}) => {
  // `name` becomes required while a row has none, and nothing has been decided about it.
  await writeSchema(request, 'base.prisma', (content) =>
    content.replace('name  String?', 'name  String '),
  )

  await page.goto('/migrate')
  const card = page.locator('li', { hasText: /User\.name becomes required, but \d+ rows? ha/u })
  await expect(card).toBeVisible()
  await expect(card).toContainText('Not decided')
  // The suggestion is chosen already, with why it is the one.
  await expect(card.getByRole('radio', { name: /Set a value/u })).toBeChecked()
  await expect(card).toContainText('Suggested')
  await expect(card).toContainText('An empty string, to be put right later.')
  await expect(page.getByRole('button', { name: 'Run and record' })).toBeDisabled()
  await expect(page.getByText('Decide what becomes of the data first.')).toBeVisible()

  // Deciding it plans again with it: nothing blocks, and the fix is a step with its rows.
  await card.getByRole('textbox').fill('unknown')
  await card.getByRole('button', { name: 'Use this' }).click()
  const decided = page.locator('li', { hasText: 'The empty values of User.name' })
  await expect(decided).toContainText('Decided')
  await expect(decided).toContainText('Set a value · unknown')
  await expect(page.getByText('Changes the rows of User.name as decided')).toBeVisible()
  // The data migration's SQL is there to read: on the decision, and in the whole migration.sql.
  await decided.getByRole('button', { name: /The empty values of User\.name/u }).click()
  await expect(decided).toContainText('The SQL this decision runs')
  await expect(decided).toContainText('UPDATE "User" SET "name"')
  await page.getByText('The whole migration.sql').click()
  await expect(page.locator('details', { hasText: 'The whole migration.sql' })).toContainText(
    'UPDATE "User" SET "name"',
  )
  await expect(page.locator('ol > li').first()).toContainText('to change')
  await expect(page.getByRole('button', { name: 'Run and record' })).toBeEnabled()

  await resetSchema(request)
})

test('a fix over more rows than asked for at a time is written a batch at a time', async ({
  page,
  request,
}) => {
  await writeSchema(request, 'base.prisma', (content) =>
    content.replace('name  String?', 'name  String '),
  )
  // Three users without a name in all: the fixture's one and these two.
  const added = await request.post('/api/db/sql', {
    data: {
      sql: `INSERT INTO "User" ("email", "role") VALUES ('dee@example.com', 'VIEWER'), ('eve@example.com', 'VIEWER')`,
    },
  })
  expect(added.ok()).toBe(true)
  await request.put('/api/migrate/decisions', {
    data: {
      decisions: [
        { kind: 'not-null', modelName: 'User', field: 'name', choice: 'value', value: 'unknown' },
      ],
    },
  })

  await page.goto('/migrate')
  await expect(page.getByText('Changes the rows of User.name as decided')).toBeVisible()
  const whole = page.locator('details', { hasText: 'The whole migration.sql' })
  await page.getByText('The whole migration.sql').click()
  await expect(whole).toContainText(`UPDATE "User" SET "name" = 'unknown' WHERE "name" IS NULL;`)
  await expect(whole).not.toContainText('LIMIT')

  // Asked for two rows at a time, the plan is made again: two batches, and the statement that
  // takes whatever is left.
  await page.getByRole('textbox', { name: 'Rows at a time' }).fill('2')
  await page.keyboard.press('Tab')
  await expect(whole).toContainText(
    `UPDATE "User" SET "name" = 'unknown' WHERE rowid IN (SELECT rowid FROM "User" WHERE "name" IS NULL LIMIT 2);`,
  )

  await request.post('/api/db/sql', {
    data: { sql: `DELETE FROM "User" WHERE "email" IN ('dee@example.com', 'eve@example.com')` },
  })
  await resetSchema(request)
})

test('a decision is kept, the page opens on it again, and it can be undone', async ({
  page,
  request,
}) => {
  await writeSchema(request, 'base.prisma', (content) =>
    content.replace('name  String?', 'name  String '),
  )
  await page.goto('/migrate')
  await page
    .locator('li', { hasText: /User\.name becomes required/u })
    .getByRole('button', { name: 'Use this' })
    .click()
  await expect(page.locator('li', { hasText: 'The empty values of User.name' })).toContainText(
    'Decided',
  )

  // Studio keeps it beside the schema, so it is the setting from now on rather than a page state.
  const kept = await request.get('/api/migrate/decisions')
  expect(await kept.json()).toMatchObject({
    decisions: [{ kind: 'not-null', modelName: 'User', field: 'name', choice: 'value', value: '' }],
  })

  // Opened again, the page plans with it.
  await page.reload()
  const decided = page.locator('li', { hasText: 'The empty values of User.name' })
  await expect(decided).toContainText('Decided')

  // Undone, the check blocks again and the file forgets it.
  await decided.getByRole('button', { name: /The empty values of User\.name/u }).click()
  await decided.getByRole('button', { name: 'Undo the decision' }).click()
  await expect(page.locator('li', { hasText: /User\.name becomes required/u })).toContainText(
    'Not decided',
  )
  await expect
    .poll(async () => {
      const response = await request.get('/api/migrate/decisions')
      const left: { readonly decisions: readonly unknown[] } = await response.json()
      return left.decisions
    })
    .toStrictEqual([])

  await resetSchema(request)
})

test('every suggestion is taken at once', async ({ page, request }) => {
  await writeSchema(request, 'base.prisma', (content) =>
    content.replace('name  String?', 'name  String '),
  )
  await page.goto('/migrate')
  await expect(page.getByText(/still to decide/u)).toBeVisible()
  await page.getByRole('button', { name: 'Use every suggestion' }).click()
  await expect(page.getByText(/^All \d+ decided$/u)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run and record' })).toBeEnabled()

  await resetSchema(request)
})

// A field renamed in the schema reads to Prisma as a column dropped and another added, and the
// values of the old one go with it. The page reads it as the rename it is, and suggests keeping them.
test('a renamed field is suggested as a rename, and keeps its values', async ({
  page,
  request,
}) => {
  await writeSchema(request, 'base.prisma', (content) =>
    content.replace('name  String?', 'fullName String?'),
  )

  // Undecided, the rebuild copies the columns it knows and leaves the values of `name` behind.
  const copyOf = (plan: {
    readonly steps: readonly { readonly kind: string; readonly statements: readonly string[] }[]
  }) =>
    plan.steps
      .filter((step) => step.kind === 'migration')
      .flatMap((step) => step.statements)
      .find((statement) => statement.startsWith('INSERT INTO "new_User"'))
  const dropping = await request.post('/api/migrate/plan', { data: { name: 'rename' } })
  const dropped = await dropping.json()
  expect(copyOf(dropped)).not.toContain('"fullName"')

  await page.goto('/migrate')
  const card = page.locator('li', { hasText: 'The column User.name goes away' })
  await expect(card.getByRole('radio', { name: /It was renamed/u })).toBeChecked()
  await expect(card.getByRole('combobox')).toHaveValue('fullName')
  await card.getByRole('button', { name: 'Use this' }).click()
  await expect(page.locator('li', { hasText: 'The values of the column User.name' })).toContainText(
    'Decided',
  )

  // The migration carries the values over rather than dropping them.
  const kept = await request.post('/api/migrate/plan', { data: { name: 'rename' } })
  const plan = await kept.json()
  expect(copyOf(plan)).toContain('"fullName"')
  expect(copyOf(plan)).toContain('"name"')

  await resetSchema(request)
})

// Two columns added read alike as where a dropped one went: the page suggests neither, ranks
// both, and a pick fills the decision in. A column dropped with nowhere to go says it is lost.
test('the places a dropped column could have gone are ranked, and one with none says it is lost', async ({
  page,
  request,
}) => {
  await writeSchema(request, 'base.prisma', (content) =>
    content.replace('name  String?', 'fullName    String?\n  displayName String?'),
  )
  await page.goto('/migrate')
  const card = page.locator('li', { hasText: 'The column User.name goes away' })
  const candidates = card.getByTestId('candidates')
  await expect(candidates.locator('ol > li')).toHaveCount(2)
  await expect(candidates).toContainText('Renamed to fullName')
  await expect(candidates).toContainText('Renamed to displayName')
  await expect(candidates).toContainText('A similar name, in this table')
  await expect(card.getByText('Likeliest')).toHaveCount(0)
  // The summary of what is lost says it need not be.
  await expect(page.getByTestId('impact')).toContainText('2 places these values could have gone')

  await candidates.locator('ol > li').nth(1).getByRole('button', { name: 'Pick' }).click()
  await expect(card.getByRole('radio', { name: /It was renamed/u })).toBeChecked()
  await expect(card.getByRole('combobox')).toHaveValue('displayName')
  await card.getByRole('button', { name: 'Use this' }).click()
  await expect(page.locator('li', { hasText: 'The values of the column User.name' })).toContainText(
    'It was renamed: keep the values · displayName',
  )

  await request.put('/api/migrate/decisions', { data: { decisions: [] } })
  await resetSchema(request)
  await writeSchema(request, 'base.prisma', (content) =>
    content.replace(/^\s*name\s+String\?\n/mu, ''),
  )
  await page.goto('/migrate')
  const lost = page
    .locator('li', { hasText: 'The column User.name goes away' })
    .filter({ has: page.getByRole('radiogroup') })
  await expect(lost).toContainText('No column the migration adds reads as where these')
  await expect(lost.getByTestId('candidates')).toHaveCount(0)

  await resetSchema(request)
})

// A column moving to a model the migration creates: the destination is completed from the columns
// the migration adds, and the panel beside the decision draws how the values move.
test('the destination of a move is completed, and the panel beside it shows how the values move', async ({
  page,
  request,
}) => {
  await writeSchema(
    request,
    'base.prisma',
    (content) =>
      `${content.replace('name  String?', 'profile Profile?')}
model Profile {
  id       Int     @id @default(autoincrement())
  userId   Int     @unique
  user     User    @relation(fields: [userId], references: [id])
  fullName String?
  bio      String?
}
`,
  )
  await page.goto('/migrate')
  const card = page
    .locator('li', { hasText: 'The column User.name goes away' })
    .filter({ has: page.getByRole('radiogroup') })
  const how = card.getByTestId('how')
  // The suggestion is drawn as it stands: from User.name, along the key, into a new table.
  await expect(how).toContainText('User.name')
  await expect(how).toContainText('along Profile.userId → User.id')
  await expect(how).toContainText('Profile.fullName')
  await expect(how).toContainText('new table')
  await expect(how).toContainText('The migration creates Profile.')
  await expect(how).toContainText('Values now')

  // Every column the migration adds to the related model is offered; the key columns are not.
  // The list closes as the page scrolls, as a popover does: the box is brought into view first.
  // The browser tells the page of a scroll with the next frame it draws, not as it happens, so the
  // list is opened after that frame: opened before it, the scroll arrives late and closes it again.
  await card.getByRole('combobox').scrollIntoViewIfNeeded()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        globalThis.requestAnimationFrame(() => {
          globalThis.requestAnimationFrame(() => {
            resolve()
          })
        })
      }),
  )
  await card.getByRole('combobox').fill('')
  await expect(page.getByRole('option')).toHaveText([/Profile\.fullName/u, /Profile\.bio/u])
  await page.getByRole('option', { name: /Profile\.bio/u }).click()
  await expect(card.getByRole('combobox')).toHaveValue('Profile.bio')
  await expect(how).toContainText('Profile.bio')

  // A name the migration does not add is said to be refused before the plan refuses it.
  await card.getByRole('combobox').fill('Profile.nope')
  await expect(how).toContainText('Profile.nope is not a column this migration adds')

  await card.getByRole('radio', { name: /Let the values go/u }).check()
  await expect(how).toContainText('lost with the column')

  await resetSchema(request)
})

// Rows holding an enum member the schema drops: the check blocks the migration until it is told
// which member those rows become.
test('rows of an enum member that has gone are moved to one that stays', async ({
  page,
  request,
}) => {
  await writeSchema(request, 'base.prisma', (content) =>
    content.replace('enum Role {\n  ADMIN\n', 'enum Role {\n'),
  )

  await page.goto('/migrate')
  const card = page.locator('li', { hasText: /of User\.role holds? ADMIN/u })
  await expect(card).toBeVisible()
  await expect(card.getByRole('radio', { name: /Move them to other members/u })).toBeChecked()
  await card.getByRole('textbox').fill('ADMIN=VIEWER')
  await card.getByRole('button', { name: 'Use this' }).click()
  await expect(page.locator('li', { hasText: 'The values of User.role' })).toContainText('Decided')

  const kept = await request.post('/api/migrate/plan', { data: { name: 'roles' } })
  const plan = await kept.json()
  const statements = plan.steps.flatMap(
    (step: { readonly statements: readonly string[] }) => step.statements,
  )
  expect(statements.filter((statement: string) => statement.startsWith('UPDATE'))).toStrictEqual([
    `UPDATE "User" SET "role" = CASE "role" WHEN 'ADMIN' THEN 'VIEWER' ELSE "role" END WHERE "role" IN ('ADMIN')`,
  ])

  await resetSchema(request)
})

// The Migrate page, and only it, speaks Japanese too: the button on the page switches it, and the
// browser keeps the choice. The rest of Studio stays in English.
test('the migrate page switches to Japanese, and the choice outlives a reload', async ({
  page,
  request,
}) => {
  await writeSchema(request, 'base.prisma', (content) =>
    content.replace('name  String?', 'name  String '),
  )
  await page.goto('/migrate')
  await expect(page.getByRole('heading', { level: 1, name: 'Migrate' })).toBeVisible()
  await page.getByRole('button', { name: /Show in Japanese/u }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'マイグレーション' })).toBeVisible()
  await expect(
    page.locator('li', {
      hasText: /User\.name が必須になりますが、値が空（NULL）の行が \d+ 件あります/u,
    }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '推奨をすべて採用' })).toBeVisible()
  // The sidebar is Studio's, and stays as it was.
  await expect(page.getByRole('complementary').getByRole('link', { name: 'Docs' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'マイグレーション' })).toBeVisible()
  await page.getByRole('button', { name: /Show in English/u }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Migrate' })).toBeVisible()

  await resetSchema(request)
})

// A kept decision for a field the schema no longer has does not stop the plan: it is set aside,
// said why, and deleted from the page.
test('a decision that no longer fits the schema is listed, and deleted from the page', async ({
  page,
  request,
}) => {
  await writeSchema(request, 'base.prisma', (content) =>
    content.replace('name  String?', 'name  String '),
  )
  const kept = await request.put('/api/migrate/decisions', {
    data: {
      decisions: [
        { kind: 'not-null', modelName: 'User', field: 'nmae', choice: 'value', value: 'x' },
      ],
    },
  })
  expect(kept.ok()).toBe(true)

  await page.goto('/migrate')
  const unfit = page.locator('li', { hasText: 'User.nmae: User has no field nmae.' })
  await expect(page.getByText('Decisions that no longer fit the schema')).toBeVisible()
  await expect(unfit).toBeVisible()
  // The plan is made without it: the check it would have answered is there to decide.
  await expect(page.locator('li', { hasText: /User\.name becomes required/u })).toBeVisible()

  await unfit.getByRole('button', { name: 'Delete this decision' }).click()
  await expect(page.getByText('Decisions that no longer fit the schema')).toBeHidden()
  await expect
    .poll(async () => {
      const response = await request.get('/api/migrate/decisions')
      const left: { readonly decisions: readonly unknown[] } = await response.json()
      return left.decisions
    })
    .toStrictEqual([])

  await resetSchema(request)
})

// The page follows the migrations directory as it changes on disk: a migration written there by
// `prisma migrate dev`, or brought in by a pull, shows in the history without a reload.
test('a migration written to the directory shows in the history without a reload', async ({
  page,
}) => {
  const migrations = path.join(SCHEMA_DIR, 'migrations')
  const name = '20260101000000_from_disk'
  await page.goto('/migrate')
  await expect(page.getByText(/No migrations in .*migrations\.$/u)).toBeVisible()
  try {
    mkdirSync(path.join(migrations, name), { recursive: true })
    writeFileSync(path.join(migrations, name, 'migration.sql'), 'SELECT 1;\n')
    const row = page.getByRole('row', { name: new RegExp(`^${name}`, 'u') })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row).toContainText('Pending')
    // What it runs is a press away, read from the file.
    await row.getByRole('button', { name: 'Show the SQL' }).click()
    await expect(page.getByText('SELECT 1;').first()).toBeVisible()
    // The workspace has tables and no history: the page checks where it could be baselined.
    await expect(
      page.getByText(/Differs from the database|Matches the database/u).first(),
    ).toBeVisible({
      timeout: 15_000,
    })

    rmSync(migrations, { recursive: true, force: true })
    await expect(row).toBeHidden({ timeout: 10_000 })
  } finally {
    rmSync(migrations, { recursive: true, force: true })
  }
})

test('a migration that loses data shows what goes, is rehearsed, backed up, checked and undone', async ({
  page,
  request,
}) => {
  const migrations = path.join(SCHEMA_DIR, 'migrations')
  try {
    await writeSchema(request, 'base.prisma', (content) =>
      content.replace(/^\s*posts\s+Post\[\]\s*$/mu, ''),
    )
    await writeSchema(request, 'post.prisma', (content) =>
      content.replace(/\/\/\/ A blog post[\s\S]*?\n\}\n/u, ''),
    )
    await expect.poll(() => fileOnDisk(request, 'post.prisma')).not.toContain('model Post')
    const counted = await request.post('/api/db/sql', {
      data: { sql: 'SELECT count(*) AS n FROM "Post"' },
    })
    const body = (await counted.json()) as { rows: { n: number }[] }
    const posts = body.rows[0]?.n ?? -1

    await page.goto('/migrate')
    // What is lost is said before anything runs, and the rows themselves can be read.
    const impact = page.getByTestId('impact')
    await expect(impact.getByText(/change(s)? lose(s)? data/u)).toBeVisible()
    await expect(
      impact.getByText(`The table Post goes away, and its ${posts} rows with it`),
    ).toBeVisible()
    await impact.getByRole('button', { name: 'See what is lost' }).first().click()
    await expect(impact.getByRole('button', { name: 'Save as CSV' })).toBeVisible()

    // The run waits for a rehearsal, which runs on a copy and leaves the database as it was.
    const run = page.getByRole('button', { name: 'Run and record' })
    await expect(run).toBeDisabled()
    await expect(page.getByText('Rehearse the migration first: it loses data.')).toBeVisible()
    await page.getByRole('button', { name: 'Rehearse the migration' }).click()
    const rehearsal = page.getByTestId('rehearsal-result')
    await expect(rehearsal.getByText('The rehearsal went through')).toBeVisible({
      timeout: 15_000,
    })
    await expect(rehearsal.getByRole('row', { name: /^Post/u })).toContainText('removed')
    await expect(rehearsal.getByText('The database it leaves matches the schema.')).toBeVisible()
    const untouched = await request.post('/api/db/sql', {
      data: { sql: 'SELECT count(*) AS n FROM "Post"' },
    })
    expect(untouched.ok()).toBe(true)

    // Running it asks for the word, and takes a backup first.
    await expect(run).toBeEnabled()
    await run.click()
    const confirm = page.getByRole('alertdialog')
    await expect(confirm.getByText('Run steps that lose data?')).toBeVisible()
    await expect(confirm.getByRole('button', { name: 'Run' })).toBeDisabled()
    await confirm.getByRole('textbox').fill('migrate')
    await confirm.getByRole('button', { name: 'Run' }).click()

    // The result is checked once it is recorded.
    const result = page.getByTestId('migrate-result')
    await expect(result).toBeVisible({ timeout: 20_000 })
    await expect(result.getByText('The database now matches the schema.')).toBeVisible()
    await expect(result.getByRole('row', { name: /^Post/u })).toContainText('removed')
    await expect(result.getByRole('row', { name: /^Post/u })).toContainText(String(posts))

    // And undone: the backup brings back the table, its rows and a history without the run.
    await result.getByRole('button', { name: /^Undo/u }).click()
    await expect(result).toBeHidden({ timeout: 15_000 })
    await expect
      .poll(async () => {
        const back = await request.post('/api/db/sql', {
          data: { sql: 'SELECT count(*) AS n FROM "Post"' },
        })
        if (!back.ok()) return -1
        const read = (await back.json()) as { rows: { n: number }[] }
        return read.rows[0]?.n ?? -1
      })
      .toBe(posts)
    await expect(page.getByText(/No migrations in .*migrations\.$/u)).toBeVisible()
    await page.getByText(/^Backups/u).click()
    await expect(page.getByRole('button', { name: 'Restore' }).first()).toBeVisible()
    await expectNoHorizontalOverflow(page)
  } finally {
    await resetSchema(request)
    rmSync(migrations, { recursive: true, force: true })
    rmSync(path.join(SCHEMA_DIR, '.hekireki', 'backups'), { recursive: true, force: true })
  }
})
