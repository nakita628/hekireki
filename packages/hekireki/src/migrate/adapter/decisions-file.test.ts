import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { NodeFileSystem } from '@effect/platform-node'
import { Effect } from 'effect'
import { afterAll, describe, expect, it } from 'vite-plus/test'

import { DECISIONS_FILE, readDecisions, writeDecisions } from './decisions-file.js'

const root = mkdtempSync(path.join(tmpdir(), 'hekireki-decisions-'))

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

/** A decisions file of its own, so one test's decisions are not another's. */
function fileIn(name: string) {
  return path.join(root, name, DECISIONS_FILE)
}

describe('readDecisions and writeDecisions', () => {
  it('keeps what was decided, and reads it back as it was', async () => {
    const file = fileIn('kept')
    const decisions = [
      { kind: 'not-null', modelName: 'User', field: 'name', choice: 'value', value: 'unknown' },
      {
        kind: 'unique',
        modelName: 'User',
        field: 'email',
        choice: 'keep-first-delete',
        value: null,
      },
    ]
    expect(
      await Effect.runPromise(
        Effect.provide(writeDecisions({ file, decisions }), NodeFileSystem.layer),
      ),
    ).toBe(file)
    expect(
      await Effect.runPromise(Effect.provide(readDecisions(file), NodeFileSystem.layer)),
    ).toStrictEqual(decisions)
  })

  it('writes it where a person can read it, and reads it back after an edit', async () => {
    const file = fileIn('readable')
    await Effect.runPromise(
      Effect.provide(
        writeDecisions({
          file,
          decisions: [
            { kind: 'not-null', modelName: 'User', field: 'name', choice: 'value', value: 'a' },
          ],
        }),
        NodeFileSystem.layer,
      ),
    )
    expect(JSON.parse(readFileSync(file, 'utf8'))).toStrictEqual({
      decisions: [
        { kind: 'not-null', modelName: 'User', field: 'name', choice: 'value', value: 'a' },
      ],
    })
    writeFileSync(
      file,
      JSON.stringify({
        decisions: [
          { kind: 'not-null', modelName: 'User', field: 'name', choice: 'value', value: 'b' },
        ],
      }),
    )
    const edited = await Effect.runPromise(
      Effect.provide(readDecisions(file), NodeFileSystem.layer),
    )
    expect(edited[0]?.value).toBe('b')
  })

  it('reads a file that is not there as no decisions', async () => {
    expect(
      await Effect.runPromise(Effect.provide(readDecisions(fileIn('empty')), NodeFileSystem.layer)),
    ).toStrictEqual([])
  })

  // The decisions say what becomes of rows: a plan made as if they were not there would do
  // something else to them, so a file that does not read stops the plan.
  it('refuses a file it cannot make sense of, naming it', async () => {
    const file = fileIn('broken')
    await Effect.runPromise(
      Effect.provide(writeDecisions({ file, decisions: [] }), NodeFileSystem.layer),
    )
    writeFileSync(file, '{ not json')
    await expect(
      Effect.runPromise(Effect.provide(readDecisions(file), NodeFileSystem.layer)),
    ).rejects.toThrow(`Cannot read the decisions in ${file}`)
    writeFileSync(file, '{"decisions":[{"kind":1}]}')
    await expect(
      Effect.runPromise(Effect.provide(readDecisions(file), NodeFileSystem.layer)),
    ).rejects.toThrow('decisions.0.kind')
  })

  it('forgets what is left out: the file is all of them', async () => {
    const file = fileIn('replaced')
    await Effect.runPromise(
      Effect.provide(
        writeDecisions({
          file,
          decisions: [
            { kind: 'not-null', modelName: 'User', field: 'name', choice: 'value', value: 'a' },
            {
              kind: 'unique',
              modelName: 'User',
              field: 'email',
              choice: 'keep-first-delete',
              value: null,
            },
          ],
        }),
        NodeFileSystem.layer,
      ),
    )
    await Effect.runPromise(
      Effect.provide(
        writeDecisions({
          file,
          decisions: [
            { kind: 'not-null', modelName: 'User', field: 'name', choice: 'value', value: 'a' },
          ],
        }),
        NodeFileSystem.layer,
      ),
    )
    expect(
      await Effect.runPromise(Effect.provide(readDecisions(file), NodeFileSystem.layer)),
    ).toHaveLength(1)
  })

  it('refuses a decision about a check there is none of, or with a choice the check does not offer', async () => {
    const file = fileIn('refused')
    await expect(
      Effect.runPromise(
        Effect.provide(
          writeDecisions({
            file,
            decisions: [
              { kind: 'not-null', modelName: 'User', field: 'name', choice: 'clamp', value: null },
            ],
          }),
          NodeFileSystem.layer,
        ),
      ),
    ).rejects.toThrow('decisions.0.choice: The check does not offer this choice.')
    // Nothing was written, so there is nothing to stop the next check.
    expect(
      await Effect.runPromise(Effect.provide(readDecisions(file), NodeFileSystem.layer)),
    ).toStrictEqual([])
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(
      file,
      JSON.stringify({
        decisions: [{ kind: 'no-such-check', modelName: 'User', field: 'name', choice: 'value' }],
      }),
    )
    await expect(
      Effect.runPromise(Effect.provide(readDecisions(file), NodeFileSystem.layer)),
    ).rejects.toThrow('decisions.0.kind: There is no check of this kind.')
  })
})
