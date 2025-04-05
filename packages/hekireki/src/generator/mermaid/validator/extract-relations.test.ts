import { describe, expect, it } from 'vitest'
import { extractRelations } from './extract-relations'
import type { Model } from '../type'
import { testPostModel } from '../../../data/generate-model-fields-data'

const extractRelationsTestCases: {
  model: Model
  expected: string[]
}[] = [
  {
    model: testPostModel,
    expected: ['    User ||--}| Post : "(id) - (userId)"'],
  },
]

describe('extractRelations', () => {
  it.each(extractRelationsTestCases)('extracts relations correctly', ({ model, expected }) => {
    const result = extractRelations(model)
    expect(result).toEqual(expected)
  })
})
