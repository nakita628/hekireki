import { describe, it, expect, vi } from 'vitest'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
const execAsync = promisify(exec)

// Test run
// pnpm vitest run ./src/generator/mermaid-er/index.test.ts

describe('mermaid', () => {
  it('should generate mermaid file', async () => {
    // TODO confirmation
    // const { stderr } = await execAsync('npx prisma generate')
    // Not Error
    // expect(stderr).toBeFalsy()

    const result = fs.readFileSync('./prisma/mermaid-er/ER.md', {
      encoding: 'utf-8',
    })

    const expected = `\`\`\`mermaid
erDiagram
    User ||--}| Post : "(id) - (userId)"
    User {
        String id "Primary key"
        String name "Display name"
    }
    Post {
        String id "Primary key"
        String title "Article title"
        String content "Body content (no length limit)"
        String userId "Foreign key referencing User.id"
    }
\`\`\``

    expect(result).toBe(expected)
  })
})
