// The words src/database speaks in, shared by every module that names a database: the dialect
// of a URL, and where the URL was found.

/** The SQL dialects a URL can point at. */
export type Dialect = 'postgresql' | 'mysql' | 'sqlite'

/** Where a database URL was found, in precedence order. */
export type UrlSource = 'flag' | 'hekireki' | 'prisma' | 'env'
