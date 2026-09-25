import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from './generated/client/client.ts'
import { DatabaseSync } from 'node:sqlite'
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: 'file:./dev.db' }) })
const raw = new DatabaseSync('dev.db')
const a = await prisma.author.create({ data: { email: 'p' } })
const p = await prisma.post.create({ data: { authorId: a.id, title: 'x' } })
console.log(raw.prepare('select released_at, createdAt, updatedAt from posts').all())
const before = raw.prepare('select updatedAt from posts').get()
await new Promise((r) => setTimeout(r, 20))
await prisma.post.update({ where: { id: p.id }, data: {} })
console.log('update with no data', before, raw.prepare('select updatedAt from posts').get())
await prisma.setting.create({ data: { key: 'k', value: 'v' } })
console.log(raw.prepare('select * from settings').all())
const forms = ['2030-01-01 09:00:00', '2030-01-01T09:00:00', '2030-01-01T18:00:00+09:00', '2030-01-01T18:00:00+0900', '2030-01-01T18:00+09:00', '2030-01-01 09:00', '2030-01-01T09:00:00.123456Z', '2030-01-01', '1893488400000', '2030-01-01 09:00:00 +00:00', '2030-01-01T09:00:00z', '2030-01-01t09:00:00Z', '2030-01-01T18:00:00+09', '2030-01-01T09:00:00.5Z', '2030-01-01T09:00:00,5Z']
for (const [i, f] of forms.entries()) {
  raw.prepare('insert into readings (sensor, at, value) values (?, ?, 1)').run(`f${i}`, f)
  try { const r = await prisma.reading.findFirstOrThrow({ where: { sensor: `f${i}` } }); console.log(JSON.stringify(f), r.at.toISOString()) } catch (e) { console.log(JSON.stringify(f), 'ERR', String(e).slice(0, 120)) }
}
raw.prepare('insert into readings (sensor, at, value) values (?, ?, 1)').run('int', 1893488400000)
console.log('int', (await prisma.reading.findFirstOrThrow({ where: { sensor: 'int' } })).at.toISOString())
await prisma.$disconnect()
