// Prints the rows of dev.db, to compare before the migration with after it.
import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync('dev.db', { readOnly: true })
const tables = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('User', 'Post', 'Profile')",
  )
  .all()
  .map((row) => String(row.name))
for (const table of ['User', 'Post', 'Profile'].filter((name) => tables.includes(name))) {
  console.log(`\n${table}`)
  console.table(db.prepare(`SELECT * FROM "${table}"`).all())
}
db.close()
