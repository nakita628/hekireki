/**
 * Represents a model field with validation metadata
 */
export type ModelField = {
  readonly documentation: string
  readonly modelName: string
  readonly fieldName: string
  readonly validation: string | null
  readonly comment: readonly string[]
}

/**
 * Represents a list of model fields
 */
export type ModelFields = readonly ModelField[]
