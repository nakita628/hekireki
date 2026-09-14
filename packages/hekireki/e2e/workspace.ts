// The files the E2E server runs on: a throwaway copy of the fixtures (the editor writes to disk),
// the Prisma Client `prisma generate` writes from them, and a SQLite database with a few rows,
// rebuilt before every run.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const E2E_DIR = import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname)
export const FIXTURES_DIR = path.join(E2E_DIR, 'fixtures')
export const WORKSPACE_DIR = path.join(E2E_DIR, '.workspace')
export const SCHEMA_DIR = path.join(WORKSPACE_DIR, 'prisma')
export const DATABASE_FILE = path.join(WORKSPACE_DIR, 'studio.db')
export const PORT = 5899
export const BASE_URL = `http://127.0.0.1:${PORT}`

/** Runs SQL against the workspace database while Studio is serving it, for seeding a test. */
export function runSql(sql: string) {
  const db = new DatabaseSync(DATABASE_FILE)
  try {
    db.exec(sql)
  } finally {
    db.close()
  }
}

const PACKAGE_DIR = path.join(E2E_DIR, '..')
const ROOT_DIR = path.join(PACKAGE_DIR, '..', '..')

/** A package the workspace resolves as if the project had installed it. */
function link(name: string, target: string) {
  const at = path.join(WORKSPACE_DIR, 'node_modules', ...name.split('/'))
  mkdirSync(path.dirname(at), { recursive: true })
  symlinkSync(realpathSync(target), at, 'dir')
}

export function prepareWorkspace() {
  rmSync(WORKSPACE_DIR, { recursive: true, force: true })
  mkdirSync(WORKSPACE_DIR, { recursive: true })
  cpSync(path.join(FIXTURES_DIR, 'prisma'), SCHEMA_DIR, { recursive: true })
  // What a project has for the Prisma Client page: the client, the SQLite driver adapter, and
  // TypeScript 5 for the editor (typescript@7, which the package builds with, has no language
  // service API).
  link('@prisma/client', path.join(ROOT_DIR, 'node_modules', '@prisma', 'client'))
  link(
    '@prisma/adapter-better-sqlite3',
    path.join(ROOT_DIR, 'node_modules', '@prisma', 'adapter-better-sqlite3'),
  )
  link('typescript', path.join(PACKAGE_DIR, 'node_modules', 'typescript-5'))
  const generated = spawnSync(
    path.join(PACKAGE_DIR, 'node_modules', '.bin', 'prisma'),
    ['generate', '--schema', SCHEMA_DIR],
    { encoding: 'utf8' },
  )
  if (generated.status !== 0) throw new Error(`prisma generate failed:\n${generated.stderr}`)
  const db = new DatabaseSync(DATABASE_FILE)
  db.exec(`
    CREATE TABLE "User" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "email" TEXT NOT NULL UNIQUE,
      "name" TEXT,
      "role" TEXT NOT NULL DEFAULT 'VIEWER'
    );
    CREATE TABLE "Post" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "title" TEXT NOT NULL,
      "published" INTEGER NOT NULL DEFAULT 0,
      "authorId" INTEGER NOT NULL REFERENCES "User"("id")
    );
    INSERT INTO "User" ("email", "name", "role") VALUES
      ('ada@example.com', 'Ada', 'ADMIN'),
      ('bob@example.com', 'Bob', 'VIEWER'),
      ('cy@example.com', NULL, 'VIEWER');
    INSERT INTO "Post" ("title", "published", "authorId") VALUES
      ('Hello', 1, 1),
      ('Draft', 0, 1),
      ('Notes', 1, 2);
  `)
  db.close()
}
