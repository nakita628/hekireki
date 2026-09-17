# migrate

A data migration on SQLite, from `schemas/before.prisma` to `schemas/after.prisma`, with rows that
the new schema does not take as they are. Every kind of change a migration has to carry data
through is in it:

| Change                                      | The rows in the way                            | What becomes of them                              |
| ------------------------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| `User.fullName` renamed to `name`           | 4 values the drop would lose                   | Renamed: the values stay                          |
| `User.role` from `String` to `enum Role`    | `admin`, `member`                              | Mapped to `ADMIN`, `MEMBER`                       |
| `User.age` from `String?` to `Int?`         | `'36'`, `' 41 '`, `''`                         | Converted, blanks trimmed, `''` read as NULL      |
| `User.email` made `@unique`                 | Two rows share `bob@example.com`               | The oldest by `createdAt` kept, the other deleted |
| `User.handle` added, required and `@unique` | No value for the rows already there            | `handle-` and the row's id                        |
| `User.nickname` moved to a new `Profile`    | Its values, which Prisma drops with the column | A profile made for each user with a nickname      |
| `Post.status` from `String` to `PostStatus` | `published`, `draft`, `archived`               | `PUBLISHED`, `DRAFT`, `DRAFT`                     |
| `Post.authorId` made required               | A post with no author                          | Pointed at the first user                         |

## Try it in Studio

```bash
pnpm install
cd examples/migrate
pnpm run setup          # dev.db from before.prisma, migrated and filled with data.sql
pnpm run schema:after   # schema.prisma becomes after.prisma
pnpm run studio         # http://localhost:5555/migrate
```

The Migrate page compares the schema with the database as it opens. **Use every suggestion**
takes what the page read from the schema and the rows (the table above); each can be changed.
Then look at what is lost, **Rehearse the migration** on a copy of `dev.db`, and **Run and record**:
a backup is taken first, the migration is written to `migrations/`, and the result is checked
against the rows before it. **Undo** puts the backup back.

`pnpm run setup` starts over at any point. `pnpm run rows` prints the tables.

## The same from the command line

```bash
pnpm run demo
```

`demo` does it without Studio, with the decisions of `decisions.json` in place of the page:
`hekireki migrate check` reports what is in the way, then passes once the decisions are in
`.hekireki/migrate.json`; `prisma migrate diff` writes the migration Prisma would, `hekireki migrate
plan --migration` rewrites it to carry the data, and `prisma migrate deploy` runs it.
