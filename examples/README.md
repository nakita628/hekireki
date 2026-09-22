# examples

`migrate/` is a data migration end to end on SQLite: two schemas, rows the second does not take
as they are (a renamed column, strings becoming enums, text becoming a number, duplicates under a
new unique key, a new required column, a relation made required), and what becomes of them
decided on the Migrate page of `hekireki studio`, rehearsed, and run. `pnpm run demo` in it does
the same from the command line; see [migrate/README.md](migrate/README.md).

`active-record/` runs the models `hekireki-activerecord` writes against the real Active Record on
SQLite: the `User` and `Session` of `rails generate authentication` and a blog around them, with a
Ruby check for each of the bugs reported on schemas of that shape (a doubled blank-password error,
an untranslated `belongs_to` error, a `has_many :through` defined before its through) and for each
thing the schema promises: validations and their translations, defaults, enums, timestamps, a uuid
key, every `onDelete`, a self relation, an implicit many-to-many, a composite key. `pnpm run demo`
in it generates, creates the database, runs the check and RuboCop; see
[active-record/README.md](active-record/README.md).

The other three are small projects to try `hekireki seed` and `hekireki studio` on, one per database. Each is a
`schema.prisma` with the `prisma-client` and `hekireki-seed` generators, the schema module the
latter writes (committed, so the config type-checks before `pnpm setup` has run), and a typed
`hekireki.config.ts` that names the database in its `url`: no flag and no `.env` needed.

- `sqlite/`: `seed.db` next to the schema. The widest schema of the three — every relation
  cardinality, a composite primary key, a self relation, an implicit many-to-many, and a column of
  every scalar Prisma has: `Decimal`, `BigInt`, `Bytes`, `Json` and `Float` beside the usual ones,
  with a table, columns and enum members the database holds under `@map`ped names. Faker rows plus
  real `Tag` rows; `hekireki.data.config.ts` gives every model as real rows.
- `mysql/`: `mysql://root:root@localhost:3306/seed`. Faker rows bounded per parent, real tags and
  categories.
- `postgresql/`: `postgresql://postgres:postgres@localhost:5432/seed`. The same config on PostgreSQL.

`docker compose -f examples/compose.yaml up -d postgres mysql` starts the MySQL and PostgreSQL of
the table (without the service names it also starts the CockroachDB and MariaDB the migration
tests use). SQLite needs nothing.

```bash
cd examples/sqlite          # or mysql, postgresql
pnpm setup                  # validate the schema, write generated/seed/schema.ts and the Prisma Client, create the tables

pnpm seed                   # fill the database from hekireki.config.ts (--reset first)
pnpm seed:sql               # write the same rows to seed.sql instead of inserting them
pnpm studio                 # look at the rows in Hekireki Studio → http://localhost:5555
```

`pnpm seed` writes through the generated Prisma Client with the dialect's adapter from the
repository's devDependencies, in one `$transaction`; the banner says so. Without a generated
client it stops and names what is missing. For the same `seed` it gives the same rows; change
`seed`, `locale` or a rule and run it again.

`pnpm prisma-studio` in `sqlite/` opens Prisma Studio on the same file (port 5556) to compare the
two side by side. Raise the `count` values in `hekireki.config.ts` for paging and search on tables
with some weight to them.

`sqlite/` also has a second config, `hekireki.data.config.ts` (`pnpm seed:data`), with no faker and no
id written anywhere: children are nested under their parent, parents elsewhere are named by a
unique key (`author: { email }`), tags by label. Its rows live in `data/*.ts`, typed with
`defineData(schema, 'Model', rows)` and `Row<typeof schema, 'Model'>`; `hekireki seed` resolves
the imports without an extension to those `.ts` files itself, the way a bundler would.

Things to try in a config: a field name the model does not have, an enum member that is not in
the enum, `count` next to `data`, a `data` row without a required field, or a rule that returns
the wrong type. The first four do not compile; the last is caught before anything is inserted,
with the row and field named.

`test/db/seed.test.ts` runs `mysql/` and `postgresql/` against real servers in CI (the `Seed DB`
workflow) and locally when `HEKIREKI_SEED_MYSQL` / `HEKIREKI_SEED_PG` are set; it creates the
tables with `prisma db push`, seeds through the built CLI, and checks the foreign keys, the
constraints, the sequences and the `--sql` script. Its `--url` overrides the config's.
