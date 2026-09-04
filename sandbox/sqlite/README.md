# sandbox/sqlite

One small SQLite database, so Hekireki Studio and Prisma Studio can be opened on the same data
side by side.

```bash
cd sandbox/sqlite
pnpm setup           # validate the schema, create sandbox.db, fill it

pnpm studio          # Hekireki Studio  → http://localhost:5555
pnpm prisma-studio   # Prisma Studio    → http://localhost:5555
```

Run the two in separate terminals; they use different ports and neither locks the file, so both
can be open at once. `pnpm reset` throws the database away and builds it again.

The connection string is passed on the command line rather than written into `schema.prisma`:
Prisma 7's schema parser rejects `url` inside a `datasource` block. `sandbox.db` is not committed.

The schema is deliberately small, but it carries the shapes worth comparing: an enum, a
one-to-many, an optional relation, a self relation (`Category`), a compound `@@unique` and an
`@@index`. `seed.mjs` writes the rows through `node:sqlite`, so the sandbox has no dependencies of
its own.
