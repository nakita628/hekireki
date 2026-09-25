# exposed

The tables and DAO entities `hekireki-exposed` writes from `schema.prisma` into
`src/main/kotlin/models`, compiled with every warning an error beside `Check.kt` and run through
Exposed 1.5 against the PostgreSQL tables `prisma db push` creates. Prisma Client shares the
database: each reads what the other wrote.

```bash
pnpm install
docker compose -f ../compose.yaml up -d postgres
cd examples/exposed
pnpm run demo                  # or EXPOSED_DATABASE=postgresql://… pnpm run demo
```

`src/main/kotlin/models` is committed as `prisma generate` writes it. `demo` starts from nothing
all the same: `prisma generate` writes the models and the Prisma Client in `generated/client`,
and `run.ts` pushes the schema to the database named `exposed` (made when it is not there), builds
`Check.kt` with Gradle (`gradle.ts` fetches the distribution once into `.gradle-dist/`; a JDK 21 is
needed), and runs, with the JVM and Node in `Asia/Tokyo` and then in UTC: `Check.kt check` on
Exposed alone, `Check.kt seed`, which writes rows for `node interop.ts` to read through Prisma
Client and write its own, and `Check.kt read`, which reads those. Each check prints one `ok:` line.

## DateTime

The schema has a `DateTime` in each form Prisma gives one on PostgreSQL: `timestamp(3)`, the
native types of every precision, `date`, `time`, `timetz`, `timestamptz`, lists, `now()`, several
`@updatedAt`, literal defaults with an offset and with microseconds, and a `DateTime` in a
composite key. The generated column types match Prisma Client:

- A value is written and read as the UTC instant, the UTC date or the UTC time of day, bound as
  the `java.time` class pgjdbc maps the column to, never through the JVM's zone. A `timetz` is
  written and read at offset zero, `18:00:00.123+09:00` stored as `09:00:00.123+00`.
- A value finer than a millisecond is truncated to it, in every native type, as a JavaScript Date
  holds it: `09:00:00.123999999` is `.123` in a `timestamp(6)` too, and a query with it finds the
  row. A `timestamp(0)` or `time(0)` rounds Prisma's milliseconds to the second, for both clients.
- `now()` and every `@updatedAt` are stamped by the client to the millisecond, on a DAO or a DSL
  insert; a literal default is the instant Prisma Client writes for it (`+09:00` taken off). The
  DAO stamps every `@updatedAt` it is not given on update. **A DSL `Table.update` does not**:
  Exposed has no hook for it, so set the column there, `it[updatedAt] = Instant.now()`.
- **Open the connection with the session in UTC**, as `Check.kt` does:
  `Database.connect(url, setupConnection = { it.createStatement().use { s -> s.execute("SET TIME ZONE 'UTC'") } })`.
  pgjdbc sets the session's `TimeZone` to the JVM's zone (`options=-c TimeZone=UTC` in the URL does
  not change that), and what PostgreSQL computes itself follows it: a
  `@default(dbgenerated("CURRENT_TIMESTAMP"))` or `now()` in SQL on a column without a time zone
  would be the Tokyo clock. Prisma Client's session is in the server's zone, UTC.
