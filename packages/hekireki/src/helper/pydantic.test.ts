import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import {
  collectPydanticImports,
  makePydanticField,
  makePydanticModel,
  pydanticFieldName,
} from './pydantic.js'

function makeField(overrides: Partial<DMMF.Field> & { name: string; type: string }): DMMF.Field {
  return {
    kind: 'scalar',
    isList: false,
    isRequired: true,
    isUnique: false,
    isId: false,
    isReadOnly: false,
    isGenerated: false,
    isUpdatedAt: false,
    hasDefaultValue: false,
    ...overrides,
  }
}

function makeModel(overrides: Partial<DMMF.Model> & { name: string }): DMMF.Model {
  return {
    dbName: null,
    fields: [],
    uniqueFields: [],
    uniqueIndexes: [],
    primaryKey: null,
    isGenerated: false,
    schema: null,
    ...overrides,
  }
}

describe('pydanticFieldName', () => {
  it('should suffix Python hard keywords with an underscore', () => {
    expect(pydanticFieldName('async')).toBe('async_')
    expect(pydanticFieldName('yield')).toBe('yield_')
    expect(pydanticFieldName('class')).toBe('class_')
  })

  it('should keep soft keywords and ordinary names unchanged', () => {
    expect(pydanticFieldName('type')).toBe('type')
    expect(pydanticFieldName('match')).toBe('match')
    expect(pydanticFieldName('self')).toBe('self')
    expect(pydanticFieldName('name')).toBe('name')
  })
})

describe('makePydanticField', () => {
  it('should return null for relation fields', () => {
    expect(
      makePydanticField(makeField({ name: 'posts', kind: 'object', type: 'Post' }), undefined),
    ).toBe(null)
  })

  it('should build a required scalar field', () => {
    expect(makePydanticField(makeField({ name: 'name', type: 'String' }), undefined)).toStrictEqual(
      {
        line: '    name: str',
        expression: 'str',
      },
    )
  })

  it('should build an optional scalar field with a None default', () => {
    expect(
      makePydanticField(makeField({ name: 'bio', type: 'String', isRequired: false }), undefined),
    ).toStrictEqual({
      line: '    bio: str | None = None',
      expression: 'str | None = None',
    })
  })

  it('should keep a scalar list required without a None default', () => {
    expect(
      makePydanticField(
        makeField({ name: 'tags', type: 'String', isList: true, isRequired: false }),
        undefined,
      ),
    ).toStrictEqual({
      line: '    tags: list[str]',
      expression: 'list[str]',
    })
  })

  it('should prefer the @p. annotation over the type mapping', () => {
    expect(
      makePydanticField(
        makeField({ name: 'email', type: 'String', documentation: '@p.EmailStr' }),
        undefined,
      ),
    ).toStrictEqual({
      line: '    email: EmailStr',
      expression: 'EmailStr',
    })
  })

  it('should fall back to str for unknown types and enums without a definition', () => {
    expect(
      makePydanticField(makeField({ name: 'mystery', type: 'Unsupported' }), undefined),
    ).toStrictEqual({
      line: '    mystery: str',
      expression: 'str',
    })
    expect(
      makePydanticField(makeField({ name: 'mood', type: 'Mood', kind: 'enum' }), undefined),
    ).toStrictEqual({
      line: '    mood: str',
      expression: 'str',
    })
  })
})

describe('makePydanticModel', () => {
  it('should return null for a model with only relation fields', () => {
    expect(
      makePydanticModel(
        makeModel({
          name: 'Link',
          fields: [makeField({ name: 'target', kind: 'object', type: 'Real' })],
        }),
        undefined,
        false,
      ),
    ).toBe(null)
  })
})

describe('collectPydanticImports', () => {
  it('should always import BaseModel', () => {
    expect(
      collectPydanticImports(
        [
          makeModel({
            name: 'User',
            fields: [makeField({ name: 'id', type: 'String', isId: true })],
          }),
        ],
        undefined,
      ),
    ).toStrictEqual(['from pydantic import BaseModel'])
  })

  it('should import ConfigDict only when a generated model is strict or loose', () => {
    expect(
      collectPydanticImports(
        [
          makeModel({
            name: 'Locked',
            documentation: '@p.strictObject',
            fields: [makeField({ name: 'id', type: 'String', isId: true })],
          }),
        ],
        undefined,
      ),
    ).toStrictEqual(['from pydantic import BaseModel, ConfigDict'])
    expect(
      collectPydanticImports(
        [
          makeModel({
            name: 'Skipped',
            documentation: '@p.strictObject',
            fields: [makeField({ name: 'target', kind: 'object', type: 'Real' })],
          }),
          makeModel({
            name: 'User',
            fields: [makeField({ name: 'id', type: 'String', isId: true })],
          }),
        ],
        undefined,
      ),
    ).toStrictEqual(['from pydantic import BaseModel'])
  })
})
