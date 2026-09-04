import { Button, buttonVariants, SearchField, Tabs, toast, Tooltip } from '@heroui/react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { LuDownload, LuFileText, LuGitCompare, LuInfo, LuPlus } from 'react-icons/lu'

import { DataGrid } from '../../components/data-grid.js'
import { DetailsPanel } from '../../components/details-panel.js'
import { FieldsTable } from '../../components/fields-table.js'
import {
  getDbCountsQueryKey,
  getDbRowsModelNameQueryOptions,
  useDb,
  useDeleteDbRowsModelName,
  usePatchDbRowsModelName,
  usePostDbRowsModelName,
} from '../../hooks/index.js'
import { toCsv } from './cells.js'
import { PAGE_SIZE } from './paging.js'

type Cardinality = 'zero-one' | 'one' | 'zero-many' | 'many'

type Row = Record<string, string | number | boolean | null>

type Field = {
  readonly name: string
  readonly dbName: string | null
  readonly kind: 'scalar' | 'object' | 'enum' | 'unsupported'
  readonly type: string
  readonly isList: boolean
  readonly isRequired: boolean
  readonly isId: boolean
  readonly isForeignKey: boolean
  readonly default: string | null
  readonly documentation: string | null
  readonly annotations: readonly string[]
  readonly attributes: readonly string[]
}

type Model = {
  readonly name: string
  readonly dbName: string | null
  readonly documentation: string | null
  readonly annotations: readonly string[]
  readonly fields: readonly Field[]
  readonly primaryKey: readonly string[] | null
  readonly indexes: readonly { readonly attribute: string }[]
  readonly attributes: readonly string[]
}

type Schema = {
  readonly models: readonly { readonly name: string }[]
  readonly enums: readonly {
    readonly name: string
    readonly values: readonly { readonly name: string }[]
  }[]
  readonly relations: readonly {
    readonly id: string
    readonly origin: 'inferred' | 'annotated' | 'implicit-many-to-many'
    readonly onDelete: string | null
    readonly from: {
      readonly model: string
      readonly field: string
      readonly cardinality: Cardinality
    }
    readonly to: {
      readonly model: string
      readonly field: string
      readonly cardinality: Cardinality
    }
  }[]
}

function download(fileName: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ModelView({
  schema,
  model,
  tab,
  field,
}: {
  readonly schema: Schema
  readonly model: Model
  readonly tab: 'data' | 'fields' | null
  /** A field to open on and point at, as the palette hands one over. */
  readonly field: string | null
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const database = useDb().data ?? null
  const connected = database?.connected ?? false
  // A link that names a field means the fields, whichever tab the database would have opened.
  const activeTab: 'data' | 'fields' =
    tab ?? (field !== null ? 'fields' : connected ? 'data' : 'fields')
  const [query, setQuery] = useState('')
  const [skip, setSkip] = useState(0)
  const [details, setDetails] = useState(true)
  const [adding, setAdding] = useState(false)

  const rows = useQuery({
    ...getDbRowsModelNameQueryOptions({
      param: { modelName: model.name },
      query: { skip: String(skip), take: String(PAGE_SIZE), search: query },
    }),
    enabled: connected && activeTab === 'data',
    placeholderData: keepPreviousData,
  })
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['db', '/db/rows/:modelName'] }),
      queryClient.invalidateQueries({ queryKey: getDbCountsQueryKey() }),
    ])
  }
  const insert = usePostDbRowsModelName({
    mutation: {
      onSuccess: async () => {
        setAdding(false)
        await invalidate()
      },
      onError: () => {
        toast.danger('The row could not be written.')
      },
    },
  })
  const update = usePatchDbRowsModelName({
    mutation: {
      onSuccess: invalidate,
      onError: () => {
        toast.danger('The row could not be written.')
      },
    },
  })
  const remove = useDeleteDbRowsModelName({
    mutation: {
      onSuccess: invalidate,
      onError: () => {
        toast.danger('The row could not be written.')
      },
    },
  })
  const saving = insert.isPending || update.isPending || remove.isPending
  const page = rows.data ?? null
  const scalarCount = model.fields.filter((f) => f.kind !== 'object').length
  const param = { modelName: model.name }

  const exportRows = (format: 'csv' | 'json') => {
    if (!page) return
    if (format === 'csv') download(`${model.name}.csv`, toCsv(page.columns, page.rows), 'text/csv')
    else download(`${model.name}.json`, JSON.stringify(page.rows, null, 2), 'application/json')
  }

  return (
    <section
      className={`grid min-h-0 flex-1 overflow-hidden ${details ? 'grid-cols-[minmax(0,1fr)_320px]' : 'grid-cols-[minmax(0,1fr)]'}`}
    >
      <div className="flex min-h-0 min-w-0 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-6 py-3">
          <h1 className="page-title">{model.name}</h1>
          {model.dbName ? (
            <span className="font-mono text-ui text-muted">{model.dbName}</span>
          ) : null}
          <span className="text-ui leading-tight text-muted">
            {activeTab === 'data' && page
              ? `${page.total} ${page.total === 1 ? 'row' : 'rows'}`
              : `${scalarCount} ${scalarCount === 1 ? 'field' : 'fields'}`}
          </span>
          <SearchField
            className="min-w-[260px]"
            aria-label={activeTab === 'data' ? 'Search every column' : 'Search every field'}
            value={query}
            onChange={(value) => {
              setQuery(value)
              setSkip(0)
            }}
          >
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input
                placeholder={activeTab === 'data' ? 'Search every column…' : 'Search every field…'}
              />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          {activeTab === 'data' ? (
            <>
              <Button
                variant="outline"
                isDisabled={!connected}
                onPress={() => {
                  setAdding(true)
                }}
              >
                <LuPlus size={15} />
                Add row
              </Button>
              <Tooltip>
                <Button
                  variant="outline"
                  isDisabled={!page}
                  onPress={() => {
                    exportRows('csv')
                  }}
                >
                  <LuDownload size={15} />
                  CSV
                </Button>
                <Tooltip.Content>Download this page of rows as a CSV file</Tooltip.Content>
              </Tooltip>
              <Tooltip>
                <Button
                  variant="outline"
                  isDisabled={!page}
                  onPress={() => {
                    exportRows('json')
                  }}
                >
                  <LuDownload size={15} />
                  JSON
                </Button>
                <Tooltip.Content>Download this page of rows as a JSON file</Tooltip.Content>
              </Tooltip>
            </>
          ) : (
            <>
              <Link
                className={buttonVariants({ variant: 'ghost' })}
                to="/"
                search={{ focus: model.name }}
              >
                <LuGitCompare size={15} />
                Show in diagram
              </Link>
              <Link
                className={buttonVariants({ variant: 'ghost' })}
                to="/prisma"
                search={{ focus: model.name }}
              >
                <LuFileText size={15} />
                Prisma schema
              </Link>
            </>
          )}
          <Tooltip>
            <Button
              variant={details ? 'secondary' : 'ghost'}
              isIconOnly
              className="ml-auto"
              aria-label="Toggle details"
              onPress={() => {
                setDetails((d) => !d)
              }}
            >
              <LuInfo />
            </Button>
            <Tooltip.Content>Toggle details</Tooltip.Content>
          </Tooltip>
        </header>
        <Tabs
          className="border-b border-line bg-surface px-6 py-2"
          selectedKey={activeTab}
          onSelectionChange={(key) => {
            void navigate({
              to: '/models/$name',
              params: { name: model.name },
              search: { tab: key === 'fields' ? 'fields' : 'data' },
            })
          }}
        >
          <Tabs.ListContainer className="w-fit">
            <Tabs.List aria-label={`${model.name} views`}>
              <Tabs.Tab id="data">Data</Tabs.Tab>
              <Tabs.Tab id="fields">Fields</Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
        {activeTab === 'data' ? (
          !connected ? (
            <div className="m-6 rounded-[10px] border border-line bg-surface p-5 text-muted">
              <div className="mb-1 font-semibold text-ink">No database connected</div>
              <pre className="m-0 font-mono text-code whitespace-pre-wrap">
                {database?.error ??
                  'Start Studio with --url <connection string> or set DATABASE_URL.'}
              </pre>
            </div>
          ) : rows.isError ? (
            <div className="error-box m-6">The rows could not be loaded.</div>
          ) : page === null ? (
            <div className="p-6 text-muted">Loading rows…</div>
          ) : (
            <DataGrid
              schema={schema}
              model={model}
              rows={page.rows}
              rowKey={page.key}
              total={page.total}
              skip={page.skip}
              search={query}
              loading={rows.isFetching}
              saving={saving}
              adding={adding}
              onAddingChange={setAdding}
              onPage={setSkip}
              onInsert={(values: Row) => {
                insert.mutate({ param, json: { values } })
              }}
              onUpdate={(where, values) => {
                update.mutate({ param, json: { where, values } })
              }}
              onDelete={(where) => {
                remove.mutate({ param, json: { where } })
              }}
            />
          )
        ) : (
          <>
            {model.documentation ? (
              <p className="m-0 border-b border-line bg-surface-2 px-6 py-2.5 whitespace-pre-wrap text-muted">
                {model.documentation}
              </p>
            ) : null}
            <FieldsTable schema={schema} model={model} query={query} highlight={field} />
          </>
        )}
      </div>
      {details ? <DetailsPanel schema={schema} model={model} /> : null}
    </section>
  )
}
