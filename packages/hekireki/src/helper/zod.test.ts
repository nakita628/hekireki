import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vitest'
import { makeZodModel, makeZodRelations, makeZodSchemas, PRISMA_TO_ZOD, zod } from './zod.js'

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

describe('helper/zod', () => {
  describe('PRISMA_TO_ZOD', () => {
    it('PRISMA_TO_ZOD maps String to string()', () => {
      expect(PRISMA_TO_ZOD.String).toBe('string()')
      expect(PRISMA_TO_ZOD.Int).toBe('number()')
      expect(PRISMA_TO_ZOD.Boolean).toBe('boolean()')
      expect(PRISMA_TO_ZOD.DateTime).toBe('iso.datetime()')
      expect(PRISMA_TO_ZOD.BigInt).toBe('bigint()')
    })
  })

  describe('makeZodSchemas', () => {
    it.concurrent('schemas comment true', () => {
      const result = makeZodSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key', '@v.pipe(v.string(), v.uuid())'],
            validation: 'uuid()',
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name', '@v.pipe(v.string(), v.minLength(1), v.maxLength(50))'],
            validation: 'string().min(1).max(50)',
            isRequired: true,
          },
        ],
        true,
      )
      const expected = `export const UserSchema = z.object({
  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Display name
   */
  name: z.string().min(1).max(50)
})`
      expect(result).toBe(expected)
    })
    it.concurrent('schemas comment false', () => {
      const result = makeZodSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key', '@v.pipe(v.string(), v.uuid())'],
            validation: 'uuid()',
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name', '@v.pipe(v.string(), v.minLength(1), v.maxLength(50))'],
            validation: 'string().min(1).max(50)',
            isRequired: true,
          },
        ],
        false,
      )
      const expected = `export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50)
})`
      expect(result).toBe(expected)
    })
  })

  describe('makeZodModel', () => {
    it('generates schema and type export for a simple model', () => {
      const model = makeModel({
        name: 'User',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            documentation: '@z.uuid()',
          }),
          makeField({
            name: 'name',
            type: 'String',
            documentation: '@z.string().min(1)',
          }),
        ],
      })

      const result = makeZodModel(model)

      expect(result).toContain('export const UserSchema = z.object(')
      expect(result).toContain('id: z.uuid()')
      expect(result).toContain('name: z.string().min(1)')
      expect(result).toContain('export type User = z.infer<typeof UserSchema>')
    })

    it('filters out object (relation) fields', () => {
      const model = makeModel({
        name: 'User',
        fields: [
          makeField({ name: 'id', type: 'String', documentation: '@z.uuid()' }),
          makeField({
            name: 'posts',
            type: 'Post',
            kind: 'object',
            isList: true,
            isRequired: false,
            relationName: 'PostToUser',
          }),
        ],
      })

      const result = makeZodModel(model)

      expect(result).toContain('id: z.uuid()')
      expect(result).not.toContain('posts')
    })

    it('wraps optional fields with .exactOptional()', () => {
      const model = makeModel({
        name: 'Profile',
        fields: [
          makeField({
            name: 'bio',
            type: 'String',
            isRequired: false,
            documentation: '@z.string()',
          }),
        ],
      })

      const result = makeZodModel(model)

      expect(result).toContain('bio: z.string().exactOptional()')
    })
  })

  describe('makeZodRelations', () => {
    it('returns null when no relations', () => {
      const model = makeModel({ name: 'User' })
      const result = makeZodRelations(model, [])
      expect(result).toBeNull()
    })

    it('generates relation schema with spread and relation fields', () => {
      const model = makeModel({ name: 'User' })
      const relProps = [
        { key: 'posts', targetModel: 'Post', isMany: true },
        { key: 'profile', targetModel: 'Profile', isMany: false },
      ]

      const result = makeZodRelations(model, relProps)

      expect(result).toContain('export const UserRelationsSchema = z.object(')
      expect(result).toContain('...UserSchema.shape,')
      expect(result).toContain('posts: z.array(PostSchema)')
      expect(result).toContain('profile: ProfileSchema')
    })

    it('includes type export when includeType is true', () => {
      const model = makeModel({ name: 'User' })
      const relProps = [{ key: 'posts', targetModel: 'Post', isMany: true }]

      const result = makeZodRelations(model, relProps, { includeType: true })

      expect(result).toContain(
        'export type UserRelations = z.infer<typeof UserRelationsSchema>',
      )
    })
  })

  describe('zod', () => {
    it('generates full output with import and schemas', () => {
      const model = makeModel({
        name: 'User',
        fields: [
          makeField({ name: 'id', type: 'String', documentation: '@z.uuid()' }),
          makeField({ name: 'name', type: 'String', documentation: '@z.string().min(1)' }),
        ],
      })

      const result = zod([model], false, false)

      expect(result).toContain("import * as z from 'zod'")
      expect(result).toContain('export const UserSchema = z.object(')
      expect(result).toContain('id: z.uuid()')
    })

    it('uses zod/mini import when zodVersion is mini', () => {
      const model = makeModel({
        name: 'Item',
        fields: [
          makeField({ name: 'id', type: 'Int' }),
        ],
      })

      const result = zod([model], false, false, 'mini')

      expect(result).toContain("import * as z from 'zod/mini'")
    })

    it('uses @hono/zod-openapi import when zodVersion matches', () => {
      const model = makeModel({
        name: 'Item',
        fields: [
          makeField({ name: 'id', type: 'Int' }),
        ],
      })

      const result = zod([model], false, false, '@hono/zod-openapi')

      expect(result).toContain("import { z } from '@hono/zod-openapi'")
    })
  })
})
