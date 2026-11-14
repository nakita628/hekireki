import { ADAPTERS, LIBSQL_ADAPTER } from '../../constants/index.js'
import type { Dialect } from '../../types/index.js'
import { isLibsqlUrl, makePostgresSchema, makeSqliteFilePath } from './url.js'

// The Prisma driver adapter a database is opened through, and what it is constructed with.
// Pure: a dialect and a URL in, a package, a class name and the arguments out. seed/discover.ts
// loads the package from the project and constructs the class.

/**
 * The driver adapter a database is opened through: by its dialect, and libSQL by its URL.
 *
 * @example
 * adapterOf('sqlite', 'libsql://app-org.turso.io') // { pkg: '@prisma/adapter-libsql', name: 'PrismaLibSql' }
 */
export function adapterOf(dialect: Dialect, url: string) {
  return dialect === 'sqlite' && isLibsqlUrl({ url }) ? LIBSQL_ADAPTER : ADAPTERS[dialect]
}

/**
 * What the adapter is constructed with: the SQLite file, resolved from the schema directory; the
 * URL as it is for libSQL, whose client reads the server and `?authToken=` from it; and for
 * PostgreSQL the URL with the schema of its `?schema=`, which the pg driver does not read and
 * PrismaPg takes as an option.
 *
 * @example
 * makeAdapterArgs({ dialect: 'sqlite', url: 'file:./dev.db', schemaDir: '/app/prisma' })
 * // [{ url: '/app/prisma/dev.db' }]
 * makeAdapterArgs({ dialect: 'postgresql', url: 'postgresql://h/db?schema=app', schemaDir: '.' })
 * // ['postgresql://h/db?schema=app', { schema: 'app' }]
 */
export function makeAdapterArgs(input: {
  readonly dialect: Dialect
  readonly url: string
  readonly schemaDir: string
}): readonly unknown[] {
  const { dialect, url } = input
  if (dialect === 'sqlite') {
    return [
      { url: isLibsqlUrl({ url }) ? url : makeSqliteFilePath({ url, baseDir: input.schemaDir }) },
    ]
  }
  const schema = dialect === 'postgresql' ? makePostgresSchema({ url }) : null
  return schema === null ? [url] : [url, { schema }]
}
