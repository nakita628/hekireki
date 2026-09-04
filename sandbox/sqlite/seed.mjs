// Rows for the two studios to show, written straight through node:sqlite so the sandbox needs no
// dependency of its own. `db push` has already created the tables; this only fills them, and it
// starts from empty every time so a run is repeatable.
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const file = path.join(import.meta.dirname, 'sandbox.db')
const db = new DatabaseSync(file)

db.exec(`
  PRAGMA foreign_keys = ON;
  DELETE FROM "Comment";
  DELETE FROM "Post";
  DELETE FROM "Category";
  DELETE FROM "User";

  INSERT INTO "User" ("id", "email", "name", "role", "createdAt") VALUES
    (1, 'ada@example.com', 'Ada Lovelace', 'ADMIN',  '2026-01-04 09:00:00'),
    (2, 'bob@example.com', 'Bob Martin',   'EDITOR', '2026-02-11 13:30:00'),
    (3, 'cy@example.com',  NULL,           'VIEWER', '2026-03-02 08:15:00');

  INSERT INTO "Category" ("id", "name", "parentId") VALUES
    (1, 'Engineering', NULL),
    (2, 'Databases',   1),
    (3, 'Frontend',    1);

  INSERT INTO "Post" ("id", "title", "body", "published", "views", "authorId", "categoryId") VALUES
    (1, 'Hello, Prisma',   'A first look at the schema language.', 1, 128, 1, 2),
    (2, 'Indexes matter',  'Why @@index earns its keep.',          1,  42, 1, 2),
    (3, 'Draft: routing',  NULL,                                   0,   0, 2, 3),
    (4, 'Uncategorised',   'No category on purpose.',              1,   7, 2, NULL);

  INSERT INTO "Comment" ("id", "body", "createdAt", "postId", "authorId") VALUES
    (1, 'Clear write-up, thanks.', '2026-01-05 10:00:00', 1, 2),
    (2, 'Which index type?',       '2026-01-05 11:20:00', 1, 3),
    (3, 'Fixed the typo.',         '2026-02-12 09:05:00', 2, 1),
    (4, 'Posted anonymously.',     '2026-03-03 16:40:00', 2, NULL);
`)

const count = (table) => db.prepare(`SELECT count(*) AS n FROM "${table}"`).get().n
console.log(
  `seeded ${file}\n` +
    `  ${count('User')} users, ${count('Category')} categories, ` +
    `${count('Post')} posts, ${count('Comment')} comments`,
)
db.close()
