import { Schema } from 'effect'

export const MultiSchema = Schema.Struct({
  id: Schema.UUID,
})
