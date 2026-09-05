// The shared test: every page collects browser errors and failed API calls, and a test fails on
// any of them, so a rendering regression that only shows up in the console is still caught.
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test as base } from '@playwright/test'
import type { APIRequestContext, Locator, Page } from '@playwright/test'
import * as z from 'zod'

import { FIXTURES_DIR } from './workspace.js'

export { expect } from '@playwright/test'

type Problems = { readonly errors: readonly string[] }

export const test = base.extend<{ readonly problems: Problems }>({
  problems: [
    async ({ page }, use) => {
      // The one mutable cell of a test: what the page reported while it ran.
      const errors: string[] = []
      const report = (entry: string) => {
        // oxlint-disable-next-line custom/no-mutation -- appended as the events arrive
        errors.push(entry)
      }
      page.on('pageerror', (error) => {
        report(`pageerror: ${error.message}`)
      })
      page.on('console', (message) => {
        if (message.type() === 'error') report(`console: ${message.text()}`)
      })
      page.on('response', (response) => {
        if (response.url().includes('/api/') && response.status() >= 500) {
          report(`${response.status()} ${response.request().method()} ${response.url()}`)
        }
      })
      await use({ errors })
      expect(errors, 'the page reported errors').toStrictEqual([])
    },
    { auto: true },
  ],
})

const Snapshot = z
  .object({
    files: z
      .array(
        z.object({
          path: z.string().meta({
            description: 'The path as Studio loaded it.',
            example: 'e2e/.workspace/prisma/base.prisma',
          }),
          content: z.string().meta({ description: 'The file text.', example: 'model User {}\n' }),
        }),
      )
      .meta({ description: 'The files on disk.' }),
  })
  .meta({ description: 'The part of GET /api/schema the tests read' })

/** The fixture files as Studio loaded them: `path` is what the API expects back. */
export async function loadedFiles(request: APIRequestContext) {
  const response = await request.get('/api/schema')
  const body: unknown = await response.json()
  return Snapshot.parse(body).files
}

/** Puts every schema file back to its fixture content, so a test leaves no edits behind. */
export async function resetSchema(request: APIRequestContext) {
  const files = await loadedFiles(request)
  const responses = await Promise.all(
    files.flatMap((file) => {
      const fixture = path.join(FIXTURES_DIR, 'prisma', path.basename(file.path))
      const content = readFileSync(fixture, 'utf8')
      return content === file.content
        ? []
        : [request.put('/api/schema/files', { data: { path: file.path, content } })]
    }),
  )
  for (const response of responses) expect(response.ok()).toBe(true)
}

/** The text of the schema file on disk, through the API. */
export async function fileOnDisk(request: APIRequestContext, name: string) {
  const files = await loadedFiles(request)
  return files.find((file) => path.basename(file.path) === name)?.content ?? ''
}

/** Nothing on the page scrolls sideways: the layout fits the viewport. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client)
}

/** Every text appears somewhere inside the element (toContainText with an array counts elements instead). */
export async function expectTexts(locator: Locator, texts: readonly string[]) {
  await Promise.all(texts.map((text) => expect(locator).toContainText(text)))
}

/** A region is laid out with at least the size, not collapsed to nothing. */
export async function expectLaidOut(
  locator: Locator,
  minimum: { readonly width: number; readonly height: number },
) {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(minimum.width)
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(minimum.height)
}

/** The Monaco editor of the Prisma page, with helpers that speak in lines. */
export function editorOf(page: Page) {
  const root = page.locator('.monaco-editor').first()
  const lines = () =>
    root.locator('.view-line').evaluateAll((nodes) =>
      nodes
        // Monaco positions lines absolutely and renders spaces as no-break spaces.
        .map((node) => ({
          top: Number.parseInt(node instanceof HTMLElement ? node.style.top : '0', 10),
          text: (node.textContent ?? '').replaceAll(' ', ' '),
        }))
        .toSorted((a, b) => a.top - b.top)
        .map((line) => line.text),
    )
  const press = async (keys: readonly string[]) => {
    for (const key of keys) await page.keyboard.press(key)
  }
  return {
    root,
    lines,
    /** Waits until the editor shows the text (Monaco renders lines lazily). */
    async ready() {
      await expect(root.locator('.view-lines')).toBeVisible()
      await expect
        .poll(async () => {
          const shown = await lines()
          return shown.length
        })
        .toBeGreaterThan(1)
    },
    /** Types like a user: key by key, so completion triggers fire. */
    async type(text: string) {
      await page.keyboard.type(text)
    },
    /** Puts the cursor at a 1-based line and column through the keyboard, like a user would. */
    async goto(line: number, column: number) {
      await root.locator('.view-lines').click({ position: { x: 5, y: 5 } })
      await press(['Control+Home', ...Array.from({ length: line - 1 }, () => 'ArrowDown')])
      // Home first stops at the indentation; from the end of the line two presses reach column 1.
      await press([
        'End',
        'Home',
        'Home',
        ...Array.from({ length: column - 1 }, () => 'ArrowRight'),
      ])
    },
  }
}
