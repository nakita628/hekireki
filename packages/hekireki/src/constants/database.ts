// The fixed values of src/database: the driver adapters Prisma publishes, the schemes a libSQL
// server answers on, the query parameters a URL carries secrets in, and the words said when no
// database is open. What reads them (database/domain, database/driver.ts) decides; these only name.
//
// Several of them are names that something outside hekireki owns: a Prisma package, a libSQL
// client, a hosting service, Node.js. Each says what can change them and what to check then, so
// an upgrade knows where to look. The tests of database/domain hold the shapes they feed, not the
// names themselves: a renamed package or class is only caught by connecting for real.
import type { Dialect } from '../types/index.js'

/**
 * The driver adapter package and class Prisma publishes for each dialect.
 *
 * May change with a Prisma release: Prisma has renamed adapter classes between majors, and MySQL
 * goes through the MariaDB adapter (`@prisma/adapter-mariadb`), which a future release could
 * replace with one of its own. When Prisma is upgraded (the `prisma` and `@prisma/*` versions in
 * the root package.json), check each package's exports, e.g. `npm view @prisma/adapter-pg@<version>`
 * or its `dist/*.d.ts`, and that the constructor still takes what `makeAdapterArgs` builds.
 */
export const ADAPTERS: Readonly<Record<Dialect, { readonly pkg: string; readonly name: string }>> =
  {
    postgresql: { pkg: '@prisma/adapter-pg', name: 'PrismaPg' },
    mysql: { pkg: '@prisma/adapter-mariadb', name: 'PrismaMariaDb' },
    sqlite: { pkg: '@prisma/adapter-better-sqlite3', name: 'PrismaBetterSqlite3' },
  }

/**
 * The adapter of a libSQL server (Turso, `sqld`), which SQLite's own adapter cannot reach.
 *
 * May change with a Prisma release: the class has been renamed before (`PrismaLibSQL` →
 * `PrismaLibSql`); `PrismaLibSql` is what 8.1.0-dev.9 exports. Its constructor takes the config of
 * `@libsql/client` (`{ url, authToken }`), so an `@libsql/client` major can change it too.
 */
export const LIBSQL_ADAPTER = { pkg: '@prisma/adapter-libsql', name: 'PrismaLibSql' } as const

/**
 * The schemes a libSQL server answers on: Turso's `libsql://`, and `http(s)://` / `ws(s)://` for
 * `sqld`. (`file:` is a libSQL scheme as well, but stays with node:sqlite here.)
 *
 * May change with `@libsql/client` (the schemes its `createClient` accepts) or with Turso (the URL
 * its dashboard and CLI hand out). The CLI's `--url` check (src/cli/index.ts) lists the same
 * schemes and has to follow.
 */
export const LIBSQL_SCHEMES: ReadonlySet<string> = new Set(['libsql', 'http', 'https', 'ws', 'wss'])

/**
 * A query parameter a URL carries a secret in, with its value: what is shown as `***`. Turso puts
 * its token in `?authToken=`; `token`, `auth_token` and `password` cover other services.
 *
 * May change with a hosting service: one that starts taking its secret in a parameter of another
 * name would have it printed in the clear until the name is added here. Check the connection
 * string format of a service before documenting it as supported.
 */
export const SECRET_QUERY_PARAMETER = /([?&](?:authToken|auth_token|token|password)=)[^&#]*/giu

/**
 * A statement SQLite answers with rows (`all`) rather than a change count (`run`).
 *
 * Stable: the statement kinds of SQLite's grammar. Only a new kind of statement that returns rows
 * would need adding.
 */
export const READ_STATEMENT = /^\s*(?:select|with|pragma|explain|show|describe|values)\b/iu

/**
 * Why there is no SQLite on a Node.js without node:sqlite, and the way out.
 *
 * May change with Node.js: 22.13 is the first 22.x where node:sqlite needs no flag. CONTRIBUTING
 * asks for Node.js 22+ (package.json names no `engines`), so a change of the version supported
 * moves here and there together.
 */
export const NO_SQLITE =
  'SQLite support needs the built-in node:sqlite module (Node.js 22.13 or newer).\n   Upgrade Node.js or pass --url pointing at a PostgreSQL/MySQL database.'

/**
 * The status of the database while none is open.
 *
 * hekireki's own: the shape Studio's API answers `GET /db` with (`DbStatus` in main.tsp). It
 * changes only with that contract.
 */
export const DISCONNECTED = {
  connected: false,
  dialect: null,
  url: null,
  source: null,
  error: null,
} as const
