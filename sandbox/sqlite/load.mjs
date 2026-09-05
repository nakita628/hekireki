// Piles rows onto the sandbox so the two studios can be compared on a table that pages, searches
// and scrolls: thousands of users, tens of thousands of posts and comments, a category tree. Runs
// after `seed.mjs` and on top of it — the handful of readable rows stay where they are — and can
// be run again: everything it adds is marked (`@load.example.com`, `Load post`) and cleared first.
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const USERS = 5000
const POSTS = 20000
const COMMENTS = 50000
const CATEGORIES = 500

const file = path.join(import.meta.dirname, 'sandbox.db')
const db = new DatabaseSync(file)
db.exec('PRAGMA foreign_keys = ON')

db.exec('BEGIN')
db.exec(`
  DELETE FROM "Comment" WHERE "body" LIKE 'Load comment %';
  DELETE FROM "Post" WHERE "title" LIKE 'Load post %';
  DELETE FROM "Category" WHERE "name" LIKE 'Load %';
  DELETE FROM "User" WHERE "email" LIKE '%@load.example.com';
`)

const roles = ['ADMIN', 'EDITOR', 'VIEWER']
const at = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString()

const user = db.prepare(
  'INSERT INTO "User" ("email", "name", "role", "createdAt") VALUES (?, ?, ?, ?) RETURNING "id"',
)
const userIds = []
for (let i = 1; i <= USERS; i++) {
  userIds.push(
    user.get(
      `user${i}@load.example.com`,
      i % 5 === 0 ? null : `Load User ${i}`,
      roles[i % 3],
      at(i),
    ).id,
  )
}

const category = db.prepare(
  'INSERT INTO "Category" ("name", "parentId") VALUES (?, ?) RETURNING "id"',
)
const roots = []
for (let i = 1; i <= 20; i++) roots.push(category.get(`Load root ${i}`, null).id)
const categoryIds = [...roots]
for (let i = 1; i <= CATEGORIES - 20; i++) {
  categoryIds.push(category.get(`Load child ${i}`, roots[i % roots.length]).id)
}

const post = db.prepare(
  'INSERT INTO "Post" ("title", "body", "published", "views", "authorId", "categoryId") VALUES (?, ?, ?, ?, ?, ?) RETURNING "id"',
)
const postIds = []
for (let i = 1; i <= POSTS; i++) {
  postIds.push(
    post.get(
      `Load post ${i} about topic ${i % 13}`,
      i % 5 === 0 ? null : 'Body text line. '.repeat(1 + (i % 40)),
      i % 2,
      (i * 7919) % 100_000,
      userIds[i % userIds.length],
      i % 7 === 0 ? null : categoryIds[i % categoryIds.length],
    ).id,
  )
}

const comment = db.prepare(
  'INSERT INTO "Comment" ("body", "createdAt", "postId", "authorId") VALUES (?, ?, ?, ?)',
)
for (let i = 1; i <= COMMENTS; i++) {
  comment.run(
    `Load comment ${i} says something`,
    at(i / 60),
    postIds[i % postIds.length],
    i % 10 === 0 ? null : userIds[i % userIds.length],
  )
}
db.exec('COMMIT')

const count = (table) => db.prepare(`SELECT count(*) AS n FROM "${table}"`).get().n
console.log(
  `loaded ${file}\n` +
    `  ${count('User')} users, ${count('Category')} categories, ` +
    `${count('Post')} posts, ${count('Comment')} comments`,
)
db.close()
