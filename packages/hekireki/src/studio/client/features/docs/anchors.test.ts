import { describe, expect, it } from 'vite-plus/test'

import { fieldTypeAnchor, typeRefAnchor, typeSectionId } from './anchors.js'

describe('typeRefAnchor', () => {
  it('links input types, output types and enums to their sections', () => {
    expect(typeRefAnchor({ type: 'UserWhereInput', location: 'inputObjectTypes' })).toBe(
      '#type-inputType-UserWhereInput',
    )
    expect(typeRefAnchor({ type: 'User', location: 'outputObjectTypes' })).toBe(
      '#type-outputType-User',
    )
    expect(typeRefAnchor({ type: 'SortOrder', location: 'enumTypes' })).toBe('#type-enum-SortOrder')
  })

  it('shows scalars and field references as text', () => {
    expect(typeRefAnchor({ type: 'Decimal', location: 'scalar' })).toBeNull()
    expect(typeRefAnchor({ type: 'StringFieldRefInput', location: 'fieldRefTypes' })).toBeNull()
  })
})

describe('fieldTypeAnchor', () => {
  it('links relation fields to the model output type and enum fields to the enum', () => {
    expect(fieldTypeAnchor({ bareTypeName: 'Post', kind: 'object' })).toBe('#type-outputType-Post')
    expect(fieldTypeAnchor({ bareTypeName: 'Role', kind: 'enum' })).toBe('#type-enum-Role')
  })

  it('shows scalar and unsupported fields as text', () => {
    expect(fieldTypeAnchor({ bareTypeName: 'BigInt', kind: 'scalar' })).toBeNull()
    expect(fieldTypeAnchor({ bareTypeName: 'Unsupported("geo")', kind: 'unsupported' })).toBeNull()
  })
})

describe('typeSectionId', () => {
  it('is the id the anchors point at', () => {
    expect(`#${typeSectionId('enum', 'Role')}`).toBe(
      fieldTypeAnchor({ bareTypeName: 'Role', kind: 'enum' }),
    )
  })
})
