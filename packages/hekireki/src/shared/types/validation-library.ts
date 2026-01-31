import type { ModelFields } from './model-field.js'

/**
 * Annotation prefix for validation libraries.
 * Examples: '@z.', '@v.', '@a.' (ArkType), '@e.' (Effect Schema)
 */
export type AnnotationPrefix = `@${string}.`

/**
 * Configuration for a validation library generator.
 * Designed to support Zod, Valibot, ArkType, Effect Schema, etc.
 */
export type ValidationLibraryConfig = {
  /**
   * The import statement for the library.
   * Example: "import * as z from 'zod'"
   */
  readonly importStatement: string

  /**
   * The annotation prefix used in documentation comments.
   * Example: '@z.' for Zod, '@v.' for Valibot
   */
  readonly annotationPrefix: AnnotationPrefix

  /**
   * Parse documentation and filter out validation-specific lines.
   * Returns lines that should be included in JSDoc comments.
   */
  readonly parseDocument: (documentation: string | undefined) => readonly string[]

  /**
   * Extract the validation expression from documentation.
   * Returns the expression without the annotation prefix.
   */
  readonly extractValidation: (documentation: string | undefined) => string | null

  /**
   * Generate the type inference line for a model.
   * Example: "export type User = z.infer<typeof UserSchema>"
   */
  readonly inferType: (modelName: string) => string

  /**
   * Build the schema code from model fields.
   */
  readonly schemas: (fields: ModelFields, comment: boolean) => string
}

/**
 * Object wrapper types supported by validation libraries.
 */
export type ObjectWrapperType = 'object' | 'strictObject' | 'looseObject'

/**
 * Library-specific object wrapper configuration.
 */
export type ObjectWrapperConfig = {
  readonly object: string
  readonly strictObject: string
  readonly looseObject: string
}
