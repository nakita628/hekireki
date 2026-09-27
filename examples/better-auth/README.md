# better-auth

[Better Auth](https://better-auth.com/) 1.7 with every plugin that keeps something in the
database, on SQLite, PostgreSQL and MySQL. Better Auth's own CLI writes the models of
`<provider>/schema.prisma` from `auth.ts`, and from each schema hekireki writes an ER diagram,
`<provider>/er.png`, and a drizzle schema, `<provider>/schema.ts`: 36 tables and 392 columns. Better Auth then runs on that drizzle schema beside Better Auth on Prisma Client, on one
database, each reading what the other wrote.

```bash
pnpm install
cd examples/better-auth
pnpm run demo                  # SQLite

docker compose -f ../compose.yaml up -d postgres mysql
pnpm run demo:postgresql       # or BETTER_AUTH_DATABASE=postgresql://… pnpm run demo:postgresql
pnpm run demo:mysql
```

`demo` writes the schema, the diagram and the drizzle schema again (`generate.ts`), makes the
tables with `prisma db push`, type-checks, and runs `check.ts` in `Asia/Tokyo`, which prints one
`ok:` line for each check. The schemas, the diagrams and the drizzle schemas are committed.

## The plugins

`plugins.ts` has them: `username`, `anonymous`, `phoneNumber`, `twoFactor`, `passkey`, `admin`,
`apiKey`, `organization` with teams and dynamic access control, `jwt`, `oauthProvider`,
`deviceAuthorization`, `sso`, `scim` with managed connections, `siwe`, `lastLoginMethod` stored in
the database, and `stripe` with subscriptions, beside the rate limit kept in the database. The
plugins that keep nothing there (`bearer`, `magicLink`, `emailOTP`, `multiSession` and the like)
add no table and are left out.

## What the checks hold it to

- **Every column of every table.** The columns the drizzle schema names are the columns the
  database has, required where they are, and drizzle selects from each of the 36 tables.
- **A user signed up through drizzle** is read by Prisma Client, created at the instant Better
  Auth said, and signs in through Better Auth on Prisma with the password stored.
- **A session made through Prisma** is read by Better Auth on drizzle, to the instant it ends.
- **An organization and its owner** made through drizzle are read by Prisma Client and listed by
  Better Auth on Prisma.
- **An API key** made through drizzle, ending in a day, is verified through Prisma.
- **A ban** set through drizzle, ending in an hour, is read by Prisma Client.

## What is changed on the way

- **A list's default on SQLite and MySQL.** Where the database has no arrays a list is a `String`
  holding JSON, and Better Auth's CLI leaves the list's default on it:
  `String? @default([])`, which Prisma refuses. `generate.ts` makes it `@default("[]")`.
- **No transactions and no SCIM on SQLite, when Better Auth runs.** better-sqlite3 runs a
  transaction in one go and takes no promise in it, so Better Auth on drizzle has none there, and
  SCIM asks for them. Its tables are in the schema and in the first two checks.
- **`better-auth.schema.ts` is not type-checked.** It is what Better Auth's CLI writes, to read
  and not to run, and the one for MySQL does not compile: it gives `text()` a `mode: 'json'`
  that drizzle's MySQL `text` has not.
- **`exactOptionalPropertyTypes` is off** in `tsconfig.json`: the types of two of the plugins do
  not hold under it. The generated drizzle schemas do.

## Beside the drizzle schema Better Auth writes

Better Auth's CLI writes a drizzle schema of its own, for a database drizzle alone uses:
`<provider>/better-auth.schema.ts`, kept here to read beside ours. `schema.ts` is for the tables
Prisma makes, and says what they are:

|              | Better Auth's                                 | hekireki's, from the Prisma schema          |
| ------------ | --------------------------------------------- | ------------------------------------------- |
| Column names | `created_at`                                  | `createdAt`, as in the Prisma schema        |
| SQLite       | `integer({ mode: 'timestamp_ms' })`, a number | `utcDateTime()`, the text Prisma writes     |
| PostgreSQL   | `timestamp()`, microseconds                   | `timestamp({ precision: 3 })`               |
| MySQL        | `timestamp({ fsp: 3 })`                       | `datetime({ fsp: 3 })`                      |
| `now()`      | the database's, `defaultNow()`                | drizzle's, one instant for the whole insert |
