// What the language features of the Prisma Client editor share: the editor they serve (its
// models, and whether the server has types to ask), and the few translations between the
// offsets the API speaks and the ranges Monaco draws.
import { Range } from 'monaco-editor/editor/editor.api.js'
import type { editor } from 'monaco-editor/editor/editor.api.js'

import type { CompletionModel } from './completion.js'

// The providers are registered once for the language; they read whichever editor is mounted.
export const registry: { models: readonly CompletionModel[]; typesAvailable: boolean } = {
  models: [],
  typesAvailable: false,
}

export function bindClientEditor(context: {
  readonly models: readonly CompletionModel[]
  readonly typesAvailable: boolean
}) {
  registry.models = context.models
  registry.typesAvailable = context.typesAvailable
}

export function toRange(
  model: editor.ITextModel,
  offsets: { readonly start: number; readonly end: number },
) {
  const start = model.getPositionAt(offsets.start)
  const end = model.getPositionAt(offsets.end)
  return new Range(start.lineNumber, start.column, end.lineNumber, end.column)
}

export function wordRange(
  model: editor.ITextModel,
  position: { readonly lineNumber: number; readonly column: number },
) {
  const word = model.getWordUntilPosition(position)
  return new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
}

/** A request the API refused (no TypeScript 5, a broken schema) leaves the editor without the feature, not with an error. */
export async function quietly<T>(request: Promise<T>) {
  try {
    return await request
  } catch {
    return null
  }
}
