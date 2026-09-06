#!/usr/bin/env node
// Lints every workflow under .github/workflows with actionlint, the same checker as the Go
// binary, loaded from the `actionlint` npm package (a WebAssembly build). The npm package ships
// no executable, so this is the command `pnpm lint:actions` runs — on any machine with the
// dependencies installed, without a binary on PATH.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createLinter } from 'actionlint'

const WORKFLOWS = '.github/workflows'

// `concurrency.queue` is a GitHub Actions key newer than the schema actionlint knows; the
// finding is noise until the schema catches up. This is the `-ignore` pattern of the binary.
const IGNORED = [/unexpected key "queue" for "concurrency"/u]

const lint = await createLinter()

const findings = readdirSync(WORKFLOWS)
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .toSorted()
  .flatMap((name) => {
    const file = join(WORKFLOWS, name)
    return lint(readFileSync(file, 'utf8'), file)
  })
  .filter((finding) => !IGNORED.some((pattern) => pattern.test(finding.message)))

for (const finding of findings) {
  console.error(
    `${finding.file}:${finding.line}:${finding.column}: ${finding.message} [${finding.kind}]`,
  )
}

if (findings.length > 0) {
  console.error(`\nactionlint: ${findings.length} problem(s) in ${WORKFLOWS}`)
  process.exit(1)
}
