import { describe, it, expect, vi } from 'vitest'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
const execAsync = promisify(exec)

describe('mermaid', () => {
  it('should generate mermaid file', async () => {
    const { stderr } = await execAsync('npx prisma generate')
    // Not Error
    expect(stderr).toBeFalsy()

    const result = fs.readFileSync('./prisma/mermaid-er/ER.md', {
      encoding: 'utf-8',
    })

    const expected = `\`\`\`mermaid
erDiagram
    User ||--|{ Post : "(id) - (userId)"
    Post ||--|{ Like : "(id) - (postId)"
    User ||--|{ Like : "(id) - (userId)"
    User {
        String id "Unique identifier for the user."
        String username "Username of the user."
        String email "Email address of the user."
        String password "Password for the user."
        DateTime createdAt "Timestamp when the user was created."
        DateTime updatedAt "Timestamp when the user was last updated."
    }
    Post {
        String id "Unique identifier for the post."
        String userId "ID of the user who created the post."
        String content "Content of the post."
        DateTime createdAt "Timestamp when the post was created."
        DateTime updatedAt "Timestamp when the post was last updated."
    }
    Like {
        String id "Unique identifier for the like."
        String postId "ID of the post that is liked."
        String userId "ID of the user who liked the post."
        DateTime createdAt "Timestamp when the like was created."
    }
\`\`\``

    expect(result).toBe(expected)
  })
})
