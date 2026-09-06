import { describe, expect, it } from 'vite-plus/test'

import { makeMysqlPlan, makePostgresPlan, makeSqlitePlan } from './plan.js'

describe('makeSqlitePlan', () => {
  it('flattens EXPLAIN QUERY PLAN rows with their parents and indents the raw text', () => {
    expect(
      makeSqlitePlan({
        rows: [
          { id: 3, parent: 0, notused: 0, detail: 'SCAN u' },
          {
            id: 8,
            parent: 3,
            notused: 0,
            detail: 'SEARCH p USING INDEX posts_user_id (user_id=?)',
          },
          { id: 12, parent: 0, notused: 0, detail: 'USE TEMP B-TREE FOR ORDER BY' },
          { nope: true },
        ],
      }),
    ).toStrictEqual({
      nodes: [
        { id: '3', parent: null, label: 'SCAN u', detail: null, cost: null, rows: null },
        {
          id: '8',
          parent: '3',
          label: 'SEARCH p USING INDEX posts_user_id (user_id=?)',
          detail: null,
          cost: null,
          rows: null,
        },
        {
          id: '12',
          parent: null,
          label: 'USE TEMP B-TREE FOR ORDER BY',
          detail: null,
          cost: null,
          rows: null,
        },
      ],
      raw: 'SCAN u\n  SEARCH p USING INDEX posts_user_id (user_id=?)\nUSE TEMP B-TREE FOR ORDER BY',
    })
  })
})

describe('makePostgresPlan', () => {
  it('flattens the Plan tree parents first, with cost, rows and conditions', () => {
    const document = [
      {
        Plan: {
          'Node Type': 'Hash Join',
          'Join Type': 'Left',
          'Total Cost': 40.5,
          'Plan Rows': 100,
          'Hash Cond': '(p.user_id = u.id)',
          Plans: [
            {
              'Node Type': 'Seq Scan',
              'Relation Name': 'posts',
              Alias: 'p',
              'Total Cost': 10,
              'Plan Rows': 400,
              Filter: '(published = 1)',
            },
            {
              'Node Type': 'Hash',
              'Total Cost': 5,
              'Plan Rows': 3,
              Plans: [
                {
                  'Node Type': 'Seq Scan',
                  'Relation Name': 'users',
                  Alias: 'users',
                  'Total Cost': 1,
                  'Plan Rows': 3,
                },
              ],
            },
          ],
        },
      },
    ]
    expect(makePostgresPlan({ document }).nodes).toStrictEqual([
      {
        id: '1',
        parent: null,
        label: 'Hash Join (Left)',
        detail: 'Hash Cond: (p.user_id = u.id)',
        cost: 40.5,
        rows: 100,
      },
      {
        id: '1.1',
        parent: '1',
        label: 'Seq Scan on posts p',
        detail: 'Filter: (published = 1)',
        cost: 10,
        rows: 400,
      },
      { id: '1.2', parent: '1', label: 'Hash', detail: null, cost: 5, rows: 3 },
      { id: '1.2.1', parent: '1.2', label: 'Seq Scan on users', detail: null, cost: 1, rows: 3 },
    ])
  })

  it('reads a JSON string and yields no steps for a shape it does not know', () => {
    expect(makePostgresPlan({ document: '[{"Plan":{"Node Type":"Result"}}]' }).nodes).toStrictEqual(
      [{ id: '1', parent: null, label: 'Result', detail: null, cost: null, rows: null }],
    )
    expect(makePostgresPlan({ document: 'not json' })).toStrictEqual({ nodes: [], raw: 'null' })
  })
})

describe('makeMysqlPlan', () => {
  it('flattens query blocks, nested loops and table accesses', () => {
    const document = {
      query_block: {
        select_id: 1,
        cost_info: { query_cost: '2.50' },
        nested_loop: [
          {
            table: {
              table_name: 'u',
              access_type: 'ALL',
              rows_examined_per_scan: 3,
              cost_info: { prefix_cost: '0.55' },
            },
          },
          {
            table: {
              table_name: 'p',
              access_type: 'ref',
              key: 'posts_user_id',
              rows_produced_per_join: 4,
              attached_condition: '(p.published = 1)',
            },
          },
        ],
      },
    }
    expect(makeMysqlPlan({ document }).nodes).toStrictEqual([
      { id: '1', parent: null, label: 'query block #1', detail: null, cost: 2.5, rows: null },
      { id: '1.1', parent: '1', label: 'nested loop', detail: null, cost: null, rows: null },
      { id: '1.1.1.1', parent: '1.1', label: 'ALL u', detail: null, cost: 0.55, rows: 3 },
      {
        id: '1.1.2.1',
        parent: '1.1',
        label: 'ref p',
        detail: 'key posts_user_id · (p.published = 1)',
        cost: null,
        rows: 4,
      },
    ])
  })
})
