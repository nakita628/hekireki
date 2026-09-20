import { format } from 'sql-formatter'

/**
 * The statement laid out for reading by sql-formatter, in the dialect the database speaks:
 * a clause per line, a subquery indented inside its parentheses. Only whitespace changes; text
 * the formatter cannot read is returned as it is.
 *
 * @param text - one or more SQL statements
 * @param dialect - the connected database's, or null for standard SQL
 * @returns the same tokens, with the whitespace between them rewritten
 */
export function formatSql(text: string, dialect: 'postgresql' | 'mysql' | 'sqlite' | null) {
  try {
    return format(text, {
      language: dialect ?? 'sql',
      keywordCase: 'preserve',
      // `?` as MySQL and SQLite bind, `$1` as PostgreSQL does.
      paramTypes: { positional: true, numbered: ['$'] },
    })
  } catch {
    return text
  }
}
