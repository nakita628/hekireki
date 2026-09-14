# sandbox/seed

A SQLite database to try `hekireki seed` on: a schema with the shapes the seeder has to get right
(UUID v7 and cuid2 ids, a one-to-one, an optional foreign key, a composite primary key, a self
relation, an implicit many-to-many), and two typed configs: `hekireki.config.ts` mixes faker rows
with real `Tag` rows, `hekireki.data.config.ts` gives every model as real rows and uses no faker,
with no id written anywhere: children are nested under their parent, parents elsewhere are named by
a unique key (`author: { email }`), tags by label. Its rows live in `data/*.ts`, typed with
`defineData(schema, 'Model', rows)` and `Row<typeof schema, 'Model'>`; `hekireki seed` resolves
the imports without an extension to those `.ts` files itself, the way a bundler would.

```bash
cd sandbox/seed
pnpm setup           # validate the schema, write generated/seed/schema.ts, create seed.db

pnpm seed            # fill seed.db from hekireki.config.ts: faker rows plus real Tag rows (--reset first)
pnpm seed:data       # fill seed.db from hekireki.data.config.ts: every model from real rows, no faker
pnpm seed:sql        # write the rows of hekireki.config.ts to seed.sql instead
pnpm studio          # look at the rows in Hekireki Studio → http://localhost:5555
```

`pnpm seed` is repeatable and, for the same `seed`, gives the same rows; change `seed`, `locale`
or a rule in `hekireki.config.ts` and run it again. `pnpm reset` throws the database away and
builds it again.

Things to try in `hekireki.config.ts`: a field name the model does not have, an enum member that
is not in `Role`, `count` next to `data` on `Tag`, a `data` row without `label`, or a `title` rule
that returns a number. The first four do not compile; the last is caught before anything is
inserted, with the row and field named.

The connection string is passed on the command line rather than written into `schema.prisma`:
Prisma 7's schema parser rejects `url` inside a `datasource` block. `seed.db` and `seed.sql` are
not committed; `generated/seed/schema.ts` is, so the config type-checks before `pnpm setup` has run.
