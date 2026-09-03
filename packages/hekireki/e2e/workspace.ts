// The files the E2E server runs on: a throwaway copy of the fixtures (the editor writes to disk)
// and a SQLite database with a few rows, rebuilt before every run.
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const E2E_DIR = import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname)
export const FIXTURES_DIR = path.join(E2E_DIR, 'fixtures')
export const WORKSPACE_DIR = path.join(E2E_DIR, '.workspace')
export const SCHEMA_DIR = path.join(WORKSPACE_DIR, 'prisma')
export const DATABASE_FILE = path.join(WORKSPACE_DIR, 'studio.db')
export const PORT = 5899
export const BASE_URL = `http://127.0.0.1:${PORT}`

export function prepareWorkspace() {
  rmSync(WORKSPACE_DIR, { recursive: true, force: true })
  mkdirSync(WORKSPACE_DIR, { recursive: true })
  cpSync(path.join(FIXTURES_DIR, 'prisma'), SCHEMA_DIR, { recursive: true })
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
