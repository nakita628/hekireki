// Starts the built Studio on a fresh workspace. Playwright runs this as its web server, so the
// workspace is rebuilt exactly once per run (the config file itself is loaded by every worker).
import { spawn } from 'node:child_process'
import path from 'node:path'

import {
  DATABASE_FILE,
  E2E_DIR,
  PORT,
  prepareWorkspace,
  SCHEMA_DIR,
  WORKSPACE_DIR,
} from './workspace.ts'

const prepared = prepareWorkspace()
if (prepared !== 0) process.exit(prepared)
const child = spawn(
  process.execPath,
  [
    path.join(E2E_DIR, '..', 'dist/bin/hekireki.js'),
    'studio',
    '--schema',
    SCHEMA_DIR,
    '--url',
    `file:${DATABASE_FILE}`,
    '--port',
    String(PORT),
  ],
  // The workspace is the project: its node_modules is where Studio finds TypeScript and the adapter.
  { stdio: 'inherit', cwd: WORKSPACE_DIR },
)
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    child.kill(signal)
  })
}
child.on('exit', (code) => {
  process.exit(code ?? 0)
})
