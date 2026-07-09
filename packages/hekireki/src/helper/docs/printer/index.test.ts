import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import type { DMMFDocument } from '../generator/transformDMMF.js'
import { generateHTML } from './index.js'

describe('generateHTML', () => {
  it('awaits the hono/css render and returns a full document without a leaked Promise', async () => {
    const data: DMMFDocument = {
      datamodel: {
        models: [
          {
            name: 'User',
            dbName: null,
            schema: null,
            fields: [
              {
                name: 'id',
                kind: 'scalar',
                type: 'String',
                isList: false,
                isRequired: true,
                isUnique: false,
                isId: true,
                isReadOnly: false,
                isGenerated: false,
                isUpdatedAt: false,
                hasDefaultValue: false,
              },
            ],
            primaryKey: null,
            uniqueFields: [],
            uniqueIndexes: [],
            isGenerated: false,
          },
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      schema: {
        inputObjectTypes: { prisma: [] },
        outputObjectTypes: { model: [], prisma: [] },
        enumTypes: { prisma: [] },
        fieldRefTypes: {},
      } as unknown as DMMF.Schema,
      mappings: [{ model: 'User' }],
    }

    const html = await generateHTML(data)

    // Regression: the old sync `element.toString()` leaked `<!DOCTYPE html>[object Promise]`.
    expect(html.includes('[object Promise]')).toBe(false)
    // A resolved render yields the full document shell.
    expect(html.startsWith('<!DOCTYPE html><html')).toBe(true)
    // <Style /> actually injected the collected hono/css.
    expect(html.includes('<style id="hono-css">')).toBe(true)
    // The data traversed the render path.
    expect(html.includes('User')).toBe(true)
  })
})
