import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  queryOptions,
  mutationOptions,
} from '@tanstack/react-query'
import type {
  UseQueryOptions,
  UseSuspenseQueryOptions,
  UseMutationOptions,
  DefaultError,
  QueryClient,
} from '@tanstack/react-query'
import type { ClientRequestOptions, InferRequestType } from 'hono/client'
import { parseResponse } from 'hono/client'
import { client } from '../lib/index.js'

export function getClientKey() {
  return ['client'] as const
}

export function getDbKey() {
  return ['db'] as const
}

export function getDocsKey() {
  return ['docs'] as const
}

export function getMigrateKey() {
  return ['migrate'] as const
}

export function getPrismaKey() {
  return ['prisma'] as const
}

export function getSchemaKey() {
  return ['schema'] as const
}

export function getSchemaQueryKey() {
  return ['schema', '/schema'] as const
}

export function getSchemaQueryOptions<
  TData = Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.$get>>>>>,
  TError = DefaultError,
>(options?: ClientRequestOptions) {
  return queryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.$get>>>>>,
    TError,
    TData,
    ReturnType<typeof getSchemaQueryKey>
  >({
    queryKey: getSchemaQueryKey(),
    queryFn({ signal }) {
      return parseResponse(
        client.schema.$get(undefined, { ...options, init: { ...options?.init, signal } }),
      )
    },
  })
}

export function useSchema<
  TData = Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.$get>>>>>,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseQueryOptions<
        Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.$get>>>>>,
        TError,
        TData,
        ReturnType<typeof getSchemaQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery(
    { ...getSchemaQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function useSuspenseSchema<
  TData = Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.$get>>>>>,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseSuspenseQueryOptions<
        Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.$get>>>>>,
        TError,
        TData,
        ReturnType<typeof getSchemaQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery(
    { ...getSchemaQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function getPostSchemaReloadMutationKey() {
  return ['schema', '/schema/reload', 'POST'] as const
}

export function getPostSchemaReloadMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.reload.$post>>>>
    >,
    TError,
    void,
    TOnMutateResult
  >({
    mutationKey: getPostSchemaReloadMutationKey(),
    async mutationFn() {
      return parseResponse(client.schema.reload.$post(undefined, options))
    },
  })
}

export function usePostSchemaReload<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.reload.$post>>>>
        >,
        TError,
        void,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostSchemaReloadMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPutSchemaFilesMutationKey() {
  return ['schema', '/schema/files', 'PUT'] as const
}

export function getPutSchemaFilesMutationOptions<TError = DefaultError, TOnMutateResult = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.files.$put>>>>>,
    TError,
    InferRequestType<typeof client.schema.files.$put>,
    TOnMutateResult
  >({
    mutationKey: getPutSchemaFilesMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.schema.files.$put>) {
      return parseResponse(client.schema.files.$put(args, options))
    },
  })
}

export function usePutSchemaFiles<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.files.$put>>>>
        >,
        TError,
        InferRequestType<typeof client.schema.files.$put>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPutSchemaFilesMutationOptions<TError, TOnMutateResult>(clientOptions)
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getSchemaEventsQueryKey() {
  return ['schema', '/schema/events'] as const
}

export function getSchemaEventsQueryOptions<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.events.$get>>>>
  >,
  TError = DefaultError,
>(options?: ClientRequestOptions) {
  return queryOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.events.$get>>>>
    >,
    TError,
    TData,
    ReturnType<typeof getSchemaEventsQueryKey>
  >({
    queryKey: getSchemaEventsQueryKey(),
    queryFn({ signal }) {
      return parseResponse(
        client.schema.events.$get(undefined, { ...options, init: { ...options?.init, signal } }),
      )
    },
  })
}

export function useSchemaEvents<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.events.$get>>>>
  >,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseQueryOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.events.$get>>>>
        >,
        TError,
        TData,
        ReturnType<typeof getSchemaEventsQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery(
    { ...getSchemaEventsQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function useSuspenseSchemaEvents<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.events.$get>>>>
  >,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseSuspenseQueryOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.events.$get>>>>
        >,
        TError,
        TData,
        ReturnType<typeof getSchemaEventsQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery(
    { ...getSchemaEventsQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function getDbQueryKey() {
  return ['db', '/db'] as const
}

export function getDbQueryOptions<
  TData = Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.$get>>>>>,
  TError = DefaultError,
>(options?: ClientRequestOptions) {
  return queryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.$get>>>>>,
    TError,
    TData,
    ReturnType<typeof getDbQueryKey>
  >({
    queryKey: getDbQueryKey(),
    queryFn({ signal }) {
      return parseResponse(
        client.db.$get(undefined, { ...options, init: { ...options?.init, signal } }),
      )
    },
  })
}

export function useDb<
  TData = Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.$get>>>>>,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseQueryOptions<
        Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.$get>>>>>,
        TError,
        TData,
        ReturnType<typeof getDbQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery(
    { ...getDbQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function useSuspenseDb<
  TData = Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.$get>>>>>,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseSuspenseQueryOptions<
        Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.$get>>>>>,
        TError,
        TData,
        ReturnType<typeof getDbQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery(
    { ...getDbQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function getDbCountsQueryKey() {
  return ['db', '/db/counts'] as const
}

export function getDbCountsQueryOptions<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.counts.$get>>>>
  >,
  TError = DefaultError,
>(options?: ClientRequestOptions) {
  return queryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.counts.$get>>>>>,
    TError,
    TData,
    ReturnType<typeof getDbCountsQueryKey>
  >({
    queryKey: getDbCountsQueryKey(),
    queryFn({ signal }) {
      return parseResponse(
        client.db.counts.$get(undefined, { ...options, init: { ...options?.init, signal } }),
      )
    },
  })
}

export function useDbCounts<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.counts.$get>>>>
  >,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseQueryOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.counts.$get>>>>
        >,
        TError,
        TData,
        ReturnType<typeof getDbCountsQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery(
    { ...getDbCountsQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function useSuspenseDbCounts<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.counts.$get>>>>
  >,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseSuspenseQueryOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.counts.$get>>>>
        >,
        TError,
        TData,
        ReturnType<typeof getDbCountsQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery(
    { ...getDbCountsQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function getDbRowsModelNameQueryKey(
  args: InferRequestType<(typeof client.db.rows)[':modelName']['$get']>,
) {
  return ['db', '/db/rows/:modelName', args] as const
}

export function getDbRowsModelNameQueryOptions<
  TData = Awaited<
    ReturnType<
      typeof parseResponse<Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$get']>>>
    >
  >,
  TError = DefaultError,
>(
  args: InferRequestType<(typeof client.db.rows)[':modelName']['$get']>,
  options?: ClientRequestOptions,
) {
  return queryOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$get']>>>
      >
    >,
    TError,
    TData,
    ReturnType<typeof getDbRowsModelNameQueryKey>
  >({
    queryKey: getDbRowsModelNameQueryKey(args),
    queryFn({ signal }) {
      return parseResponse(
        client.db.rows[':modelName'].$get(args, { ...options, init: { ...options?.init, signal } }),
      )
    },
  })
}

export function useDbRowsModelName<
  TData = Awaited<
    ReturnType<
      typeof parseResponse<Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$get']>>>
    >
  >,
  TError = DefaultError,
>(
  args: InferRequestType<(typeof client.db.rows)[':modelName']['$get']>,
  options?: {
    query?: Omit<
      UseQueryOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$get']>>>
          >
        >,
        TError,
        TData,
        ReturnType<typeof getDbRowsModelNameQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery(
    { ...getDbRowsModelNameQueryOptions<TData, TError>(args, clientOptions), ...queryOptions },
    queryClient,
  )
}

export function useSuspenseDbRowsModelName<
  TData = Awaited<
    ReturnType<
      typeof parseResponse<Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$get']>>>
    >
  >,
  TError = DefaultError,
>(
  args: InferRequestType<(typeof client.db.rows)[':modelName']['$get']>,
  options?: {
    query?: Omit<
      UseSuspenseQueryOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$get']>>>
          >
        >,
        TError,
        TData,
        ReturnType<typeof getDbRowsModelNameQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery(
    { ...getDbRowsModelNameQueryOptions<TData, TError>(args, clientOptions), ...queryOptions },
    queryClient,
  )
}

export function getPostDbRowsModelNameMutationKey() {
  return ['db', '/db/rows/:modelName', 'POST'] as const
}

export function getPostDbRowsModelNameMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$post']>>>
      >
    >,
    TError,
    InferRequestType<(typeof client.db.rows)[':modelName']['$post']>,
    TOnMutateResult
  >({
    mutationKey: getPostDbRowsModelNameMutationKey(),
    async mutationFn(args: InferRequestType<(typeof client.db.rows)[':modelName']['$post']>) {
      return parseResponse(client.db.rows[':modelName'].$post(args, options))
    },
  })
}

export function usePostDbRowsModelName<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<
              Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$post']>>
            >
          >
        >,
        TError,
        InferRequestType<(typeof client.db.rows)[':modelName']['$post']>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostDbRowsModelNameMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getDeleteDbRowsModelNameMutationKey() {
  return ['db', '/db/rows/:modelName', 'DELETE'] as const
}

export function getDeleteDbRowsModelNameMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$delete']>>>
      >
    >,
    TError,
    InferRequestType<(typeof client.db.rows)[':modelName']['$delete']>,
    TOnMutateResult
  >({
    mutationKey: getDeleteDbRowsModelNameMutationKey(),
    async mutationFn(args: InferRequestType<(typeof client.db.rows)[':modelName']['$delete']>) {
      return parseResponse(client.db.rows[':modelName'].$delete(args, options))
    },
  })
}

export function useDeleteDbRowsModelName<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<
              Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$delete']>>
            >
          >
        >,
        TError,
        InferRequestType<(typeof client.db.rows)[':modelName']['$delete']>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getDeleteDbRowsModelNameMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPatchDbRowsModelNameMutationKey() {
  return ['db', '/db/rows/:modelName', 'PATCH'] as const
}

export function getPatchDbRowsModelNameMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$patch']>>>
      >
    >,
    TError,
    InferRequestType<(typeof client.db.rows)[':modelName']['$patch']>,
    TOnMutateResult
  >({
    mutationKey: getPatchDbRowsModelNameMutationKey(),
    async mutationFn(args: InferRequestType<(typeof client.db.rows)[':modelName']['$patch']>) {
      return parseResponse(client.db.rows[':modelName'].$patch(args, options))
    },
  })
}

export function usePatchDbRowsModelName<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<
              Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$patch']>>
            >
          >
        >,
        TError,
        InferRequestType<(typeof client.db.rows)[':modelName']['$patch']>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPatchDbRowsModelNameMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostDbSqlMutationKey() {
  return ['db', '/db/sql', 'POST'] as const
}

export function getPostDbSqlMutationOptions<TError = DefaultError, TOnMutateResult = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.sql.$post>>>>>,
    TError,
    InferRequestType<typeof client.db.sql.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostDbSqlMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.db.sql.$post>) {
      return parseResponse(client.db.sql.$post(args, options))
    },
  })
}

export function usePostDbSql<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.sql.$post>>>>>,
        TError,
        InferRequestType<typeof client.db.sql.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostDbSqlMutationOptions<TError, TOnMutateResult>(clientOptions)
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostDbExplainMutationKey() {
  return ['db', '/db/explain', 'POST'] as const
}

export function getPostDbExplainMutationOptions<TError = DefaultError, TOnMutateResult = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.explain.$post>>>>>,
    TError,
    InferRequestType<typeof client.db.explain.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostDbExplainMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.db.explain.$post>) {
      return parseResponse(client.db.explain.$post(args, options))
    },
  })
}

export function usePostDbExplain<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.explain.$post>>>>
        >,
        TError,
        InferRequestType<typeof client.db.explain.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostDbExplainMutationOptions<TError, TOnMutateResult>(clientOptions)
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostDbAnalyzeMutationKey() {
  return ['db', '/db/analyze', 'POST'] as const
}

export function getPostDbAnalyzeMutationOptions<TError = DefaultError, TOnMutateResult = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.analyze.$post>>>>>,
    TError,
    InferRequestType<typeof client.db.analyze.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostDbAnalyzeMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.db.analyze.$post>) {
      return parseResponse(client.db.analyze.$post(args, options))
    },
  })
}

export function usePostDbAnalyze<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.analyze.$post>>>>
        >,
        TError,
        InferRequestType<typeof client.db.analyze.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostDbAnalyzeMutationOptions<TError, TOnMutateResult>(clientOptions)
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getClientQueryKey() {
  return ['client', '/client'] as const
}

export function getClientQueryOptions<
  TData = Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.$get>>>>>,
  TError = DefaultError,
>(options?: ClientRequestOptions) {
  return queryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.$get>>>>>,
    TError,
    TData,
    ReturnType<typeof getClientQueryKey>
  >({
    queryKey: getClientQueryKey(),
    queryFn({ signal }) {
      return parseResponse(
        client.client.$get(undefined, { ...options, init: { ...options?.init, signal } }),
      )
    },
  })
}

export function useClient<
  TData = Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.$get>>>>>,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseQueryOptions<
        Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.$get>>>>>,
        TError,
        TData,
        ReturnType<typeof getClientQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery(
    { ...getClientQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function useSuspenseClient<
  TData = Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.$get>>>>>,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseSuspenseQueryOptions<
        Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.$get>>>>>,
        TError,
        TData,
        ReturnType<typeof getClientQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery(
    { ...getClientQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function getPostClientAnalyzeMutationKey() {
  return ['client', '/client/analyze', 'POST'] as const
}

export function getPostClientAnalyzeMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.analyze.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.analyze.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostClientAnalyzeMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.client.analyze.$post>) {
      return parseResponse(client.client.analyze.$post(args, options))
    },
  })
}

export function usePostClientAnalyze<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.analyze.$post>>>>
        >,
        TError,
        InferRequestType<typeof client.client.analyze.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostClientAnalyzeMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostClientCompleteMutationKey() {
  return ['client', '/client/complete', 'POST'] as const
}

export function getPostClientCompleteMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.complete.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.complete.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostClientCompleteMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.client.complete.$post>) {
      return parseResponse(client.client.complete.$post(args, options))
    },
  })
}

export function usePostClientComplete<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.complete.$post>>>>
        >,
        TError,
        InferRequestType<typeof client.client.complete.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostClientCompleteMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostClientCompleteDetailMutationKey() {
  return ['client', '/client/complete/detail', 'POST'] as const
}

export function getPostClientCompleteDetailMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<typeof client.client.complete.detail.$post>>>
      >
    >,
    TError,
    InferRequestType<typeof client.client.complete.detail.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostClientCompleteDetailMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.client.complete.detail.$post>) {
      return parseResponse(client.client.complete.detail.$post(args, options))
    },
  })
}

export function usePostClientCompleteDetail<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<Awaited<ReturnType<typeof client.client.complete.detail.$post>>>
          >
        >,
        TError,
        InferRequestType<typeof client.client.complete.detail.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostClientCompleteDetailMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostClientHoverMutationKey() {
  return ['client', '/client/hover', 'POST'] as const
}

export function getPostClientHoverMutationOptions<TError = DefaultError, TOnMutateResult = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.hover.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.hover.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostClientHoverMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.client.hover.$post>) {
      return parseResponse(client.client.hover.$post(args, options))
    },
  })
}

export function usePostClientHover<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.hover.$post>>>>
        >,
        TError,
        InferRequestType<typeof client.client.hover.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostClientHoverMutationOptions<TError, TOnMutateResult>(clientOptions)
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostClientSignatureMutationKey() {
  return ['client', '/client/signature', 'POST'] as const
}

export function getPostClientSignatureMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.signature.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.signature.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostClientSignatureMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.client.signature.$post>) {
      return parseResponse(client.client.signature.$post(args, options))
    },
  })
}

export function usePostClientSignature<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<Awaited<ReturnType<typeof client.client.signature.$post>>>
          >
        >,
        TError,
        InferRequestType<typeof client.client.signature.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostClientSignatureMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostClientFormatMutationKey() {
  return ['client', '/client/format', 'POST'] as const
}

export function getPostClientFormatMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.format.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.format.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostClientFormatMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.client.format.$post>) {
      return parseResponse(client.client.format.$post(args, options))
    },
  })
}

export function usePostClientFormat<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.format.$post>>>>
        >,
        TError,
        InferRequestType<typeof client.client.format.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostClientFormatMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostClientCheckMutationKey() {
  return ['client', '/client/check', 'POST'] as const
}

export function getPostClientCheckMutationOptions<TError = DefaultError, TOnMutateResult = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.check.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.check.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostClientCheckMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.client.check.$post>) {
      return parseResponse(client.client.check.$post(args, options))
    },
  })
}

export function usePostClientCheck<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.check.$post>>>>
        >,
        TError,
        InferRequestType<typeof client.client.check.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostClientCheckMutationOptions<TError, TOnMutateResult>(clientOptions)
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostClientPreviewMutationKey() {
  return ['client', '/client/preview', 'POST'] as const
}

export function getPostClientPreviewMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.preview.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.preview.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostClientPreviewMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.client.preview.$post>) {
      return parseResponse(client.client.preview.$post(args, options))
    },
  })
}

export function usePostClientPreview<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.preview.$post>>>>
        >,
        TError,
        InferRequestType<typeof client.client.preview.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostClientPreviewMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostClientRunMutationKey() {
  return ['client', '/client/run', 'POST'] as const
}

export function getPostClientRunMutationOptions<TError = DefaultError, TOnMutateResult = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.run.$post>>>>>,
    TError,
    InferRequestType<typeof client.client.run.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostClientRunMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.client.run.$post>) {
      return parseResponse(client.client.run.$post(args, options))
    },
  })
}

export function usePostClientRun<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.run.$post>>>>
        >,
        TError,
        InferRequestType<typeof client.client.run.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostClientRunMutationOptions<TError, TOnMutateResult>(clientOptions)
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostPrismaFormatMutationKey() {
  return ['prisma', '/prisma/format', 'POST'] as const
}

export function getPostPrismaFormatMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.format.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.format.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostPrismaFormatMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.prisma.format.$post>) {
      return parseResponse(client.prisma.format.$post(args, options))
    },
  })
}

export function usePostPrismaFormat<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.format.$post>>>>
        >,
        TError,
        InferRequestType<typeof client.prisma.format.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostPrismaFormatMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostPrismaLintMutationKey() {
  return ['prisma', '/prisma/lint', 'POST'] as const
}

export function getPostPrismaLintMutationOptions<TError = DefaultError, TOnMutateResult = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.lint.$post>>>>>,
    TError,
    InferRequestType<typeof client.prisma.lint.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostPrismaLintMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.prisma.lint.$post>) {
      return parseResponse(client.prisma.lint.$post(args, options))
    },
  })
}

export function usePostPrismaLint<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.lint.$post>>>>
        >,
        TError,
        InferRequestType<typeof client.prisma.lint.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostPrismaLintMutationOptions<TError, TOnMutateResult>(clientOptions)
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostPrismaSymbolsMutationKey() {
  return ['prisma', '/prisma/symbols', 'POST'] as const
}

export function getPostPrismaSymbolsMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.symbols.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.symbols.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostPrismaSymbolsMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.prisma.symbols.$post>) {
      return parseResponse(client.prisma.symbols.$post(args, options))
    },
  })
}

export function usePostPrismaSymbols<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.symbols.$post>>>>
        >,
        TError,
        InferRequestType<typeof client.prisma.symbols.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostPrismaSymbolsMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostPrismaCompleteMutationKey() {
  return ['prisma', '/prisma/complete', 'POST'] as const
}

export function getPostPrismaCompleteMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.complete.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.complete.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostPrismaCompleteMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.prisma.complete.$post>) {
      return parseResponse(client.prisma.complete.$post(args, options))
    },
  })
}

export function usePostPrismaComplete<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.complete.$post>>>>
        >,
        TError,
        InferRequestType<typeof client.prisma.complete.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostPrismaCompleteMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostPrismaHoverMutationKey() {
  return ['prisma', '/prisma/hover', 'POST'] as const
}

export function getPostPrismaHoverMutationOptions<TError = DefaultError, TOnMutateResult = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.hover.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.hover.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostPrismaHoverMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.prisma.hover.$post>) {
      return parseResponse(client.prisma.hover.$post(args, options))
    },
  })
}

export function usePostPrismaHover<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.hover.$post>>>>
        >,
        TError,
        InferRequestType<typeof client.prisma.hover.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostPrismaHoverMutationOptions<TError, TOnMutateResult>(clientOptions)
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostPrismaDefinitionMutationKey() {
  return ['prisma', '/prisma/definition', 'POST'] as const
}

export function getPostPrismaDefinitionMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.definition.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.definition.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostPrismaDefinitionMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.prisma.definition.$post>) {
      return parseResponse(client.prisma.definition.$post(args, options))
    },
  })
}

export function usePostPrismaDefinition<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<Awaited<ReturnType<typeof client.prisma.definition.$post>>>
          >
        >,
        TError,
        InferRequestType<typeof client.prisma.definition.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostPrismaDefinitionMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostPrismaReferencesMutationKey() {
  return ['prisma', '/prisma/references', 'POST'] as const
}

export function getPostPrismaReferencesMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.references.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.references.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostPrismaReferencesMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.prisma.references.$post>) {
      return parseResponse(client.prisma.references.$post(args, options))
    },
  })
}

export function usePostPrismaReferences<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<Awaited<ReturnType<typeof client.prisma.references.$post>>>
          >
        >,
        TError,
        InferRequestType<typeof client.prisma.references.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostPrismaReferencesMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostPrismaRenameMutationKey() {
  return ['prisma', '/prisma/rename', 'POST'] as const
}

export function getPostPrismaRenameMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.rename.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.rename.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostPrismaRenameMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.prisma.rename.$post>) {
      return parseResponse(client.prisma.rename.$post(args, options))
    },
  })
}

export function usePostPrismaRename<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.rename.$post>>>>
        >,
        TError,
        InferRequestType<typeof client.prisma.rename.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostPrismaRenameMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostPrismaCodeActionsMutationKey() {
  return ['prisma', '/prisma/code-actions', 'POST'] as const
}

export function getPostPrismaCodeActionsMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<(typeof client.prisma)['code-actions']['$post']>>>
      >
    >,
    TError,
    InferRequestType<(typeof client.prisma)['code-actions']['$post']>,
    TOnMutateResult
  >({
    mutationKey: getPostPrismaCodeActionsMutationKey(),
    async mutationFn(args: InferRequestType<(typeof client.prisma)['code-actions']['$post']>) {
      return parseResponse(client.prisma['code-actions'].$post(args, options))
    },
  })
}

export function usePostPrismaCodeActions<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<
              Awaited<ReturnType<(typeof client.prisma)['code-actions']['$post']>>
            >
          >
        >,
        TError,
        InferRequestType<(typeof client.prisma)['code-actions']['$post']>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostPrismaCodeActionsMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getMigrateQueryKey() {
  return ['migrate', '/migrate'] as const
}

export function getMigrateQueryOptions<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.$get>>>>
  >,
  TError = DefaultError,
>(options?: ClientRequestOptions) {
  return queryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.$get>>>>>,
    TError,
    TData,
    ReturnType<typeof getMigrateQueryKey>
  >({
    queryKey: getMigrateQueryKey(),
    queryFn({ signal }) {
      return parseResponse(
        client.migrate.$get(undefined, { ...options, init: { ...options?.init, signal } }),
      )
    },
  })
}

export function useMigrate<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.$get>>>>
  >,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseQueryOptions<
        Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.$get>>>>>,
        TError,
        TData,
        ReturnType<typeof getMigrateQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery(
    { ...getMigrateQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function useSuspenseMigrate<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.$get>>>>
  >,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseSuspenseQueryOptions<
        Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.$get>>>>>,
        TError,
        TData,
        ReturnType<typeof getMigrateQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery(
    { ...getMigrateQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function getMigrateBaselineQueryKey() {
  return ['migrate', '/migrate/baseline'] as const
}

export function getMigrateBaselineQueryOptions<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.baseline.$get>>>>
  >,
  TError = DefaultError,
>(options?: ClientRequestOptions) {
  return queryOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.baseline.$get>>>>
    >,
    TError,
    TData,
    ReturnType<typeof getMigrateBaselineQueryKey>
  >({
    queryKey: getMigrateBaselineQueryKey(),
    queryFn({ signal }) {
      return parseResponse(
        client.migrate.baseline.$get(undefined, { ...options, init: { ...options?.init, signal } }),
      )
    },
  })
}

export function useMigrateBaseline<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.baseline.$get>>>>
  >,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseQueryOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.baseline.$get>>>>
        >,
        TError,
        TData,
        ReturnType<typeof getMigrateBaselineQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery(
    { ...getMigrateBaselineQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function useSuspenseMigrateBaseline<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.baseline.$get>>>>
  >,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseSuspenseQueryOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.baseline.$get>>>>
        >,
        TError,
        TData,
        ReturnType<typeof getMigrateBaselineQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery(
    { ...getMigrateBaselineQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function getPostMigrateBaselineMutationKey() {
  return ['migrate', '/migrate/baseline', 'POST'] as const
}

export function getPostMigrateBaselineMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.baseline.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.migrate.baseline.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostMigrateBaselineMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.migrate.baseline.$post>) {
      return parseResponse(client.migrate.baseline.$post(args, options))
    },
  })
}

export function usePostMigrateBaseline<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<Awaited<ReturnType<typeof client.migrate.baseline.$post>>>
          >
        >,
        TError,
        InferRequestType<typeof client.migrate.baseline.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostMigrateBaselineMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getMigrateDiffQueryKey() {
  return ['migrate', '/migrate/diff'] as const
}

export function getMigrateDiffQueryOptions<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.diff.$get>>>>
  >,
  TError = DefaultError,
>(options?: ClientRequestOptions) {
  return queryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.diff.$get>>>>>,
    TError,
    TData,
    ReturnType<typeof getMigrateDiffQueryKey>
  >({
    queryKey: getMigrateDiffQueryKey(),
    queryFn({ signal }) {
      return parseResponse(
        client.migrate.diff.$get(undefined, { ...options, init: { ...options?.init, signal } }),
      )
    },
  })
}

export function useMigrateDiff<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.diff.$get>>>>
  >,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseQueryOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.diff.$get>>>>
        >,
        TError,
        TData,
        ReturnType<typeof getMigrateDiffQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery(
    { ...getMigrateDiffQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function useSuspenseMigrateDiff<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.diff.$get>>>>
  >,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseSuspenseQueryOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.diff.$get>>>>
        >,
        TError,
        TData,
        ReturnType<typeof getMigrateDiffQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery(
    { ...getMigrateDiffQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function getPostMigratePlanMutationKey() {
  return ['migrate', '/migrate/plan', 'POST'] as const
}

export function getPostMigratePlanMutationOptions<TError = DefaultError, TOnMutateResult = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.plan.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.migrate.plan.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostMigratePlanMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.migrate.plan.$post>) {
      return parseResponse(client.migrate.plan.$post(args, options))
    },
  })
}

export function usePostMigratePlan<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.plan.$post>>>>
        >,
        TError,
        InferRequestType<typeof client.migrate.plan.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostMigratePlanMutationOptions<TError, TOnMutateResult>(clientOptions)
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostMigrateApplyMutationKey() {
  return ['migrate', '/migrate/apply', 'POST'] as const
}

export function getPostMigrateApplyMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.apply.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.migrate.apply.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostMigrateApplyMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.migrate.apply.$post>) {
      return parseResponse(client.migrate.apply.$post(args, options))
    },
  })
}

export function usePostMigrateApply<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.apply.$post>>>>
        >,
        TError,
        InferRequestType<typeof client.migrate.apply.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostMigrateApplyMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostMigrateRehearseMutationKey() {
  return ['migrate', '/migrate/rehearse', 'POST'] as const
}

export function getPostMigrateRehearseMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.rehearse.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.migrate.rehearse.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostMigrateRehearseMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.migrate.rehearse.$post>) {
      return parseResponse(client.migrate.rehearse.$post(args, options))
    },
  })
}

export function usePostMigrateRehearse<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<Awaited<ReturnType<typeof client.migrate.rehearse.$post>>>
          >
        >,
        TError,
        InferRequestType<typeof client.migrate.rehearse.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostMigrateRehearseMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getMigrateTablesQueryKey() {
  return ['migrate', '/migrate/tables'] as const
}

export function getMigrateTablesQueryOptions<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.tables.$get>>>>
  >,
  TError = DefaultError,
>(options?: ClientRequestOptions) {
  return queryOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.tables.$get>>>>
    >,
    TError,
    TData,
    ReturnType<typeof getMigrateTablesQueryKey>
  >({
    queryKey: getMigrateTablesQueryKey(),
    queryFn({ signal }) {
      return parseResponse(
        client.migrate.tables.$get(undefined, { ...options, init: { ...options?.init, signal } }),
      )
    },
  })
}

export function useMigrateTables<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.tables.$get>>>>
  >,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseQueryOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.tables.$get>>>>
        >,
        TError,
        TData,
        ReturnType<typeof getMigrateTablesQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery(
    { ...getMigrateTablesQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function useSuspenseMigrateTables<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.tables.$get>>>>
  >,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseSuspenseQueryOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.tables.$get>>>>
        >,
        TError,
        TData,
        ReturnType<typeof getMigrateTablesQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery(
    { ...getMigrateTablesQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function getMigrateBackupsQueryKey() {
  return ['migrate', '/migrate/backups'] as const
}

export function getMigrateBackupsQueryOptions<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.backups.$get>>>>
  >,
  TError = DefaultError,
>(options?: ClientRequestOptions) {
  return queryOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.backups.$get>>>>
    >,
    TError,
    TData,
    ReturnType<typeof getMigrateBackupsQueryKey>
  >({
    queryKey: getMigrateBackupsQueryKey(),
    queryFn({ signal }) {
      return parseResponse(
        client.migrate.backups.$get(undefined, { ...options, init: { ...options?.init, signal } }),
      )
    },
  })
}

export function useMigrateBackups<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.backups.$get>>>>
  >,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseQueryOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.backups.$get>>>>
        >,
        TError,
        TData,
        ReturnType<typeof getMigrateBackupsQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery(
    { ...getMigrateBackupsQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function useSuspenseMigrateBackups<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.backups.$get>>>>
  >,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseSuspenseQueryOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.backups.$get>>>>
        >,
        TError,
        TData,
        ReturnType<typeof getMigrateBackupsQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery(
    { ...getMigrateBackupsQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function getPostMigrateBackupsMutationKey() {
  return ['migrate', '/migrate/backups', 'POST'] as const
}

export function getPostMigrateBackupsMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.backups.$post>>>>
    >,
    TError,
    void,
    TOnMutateResult
  >({
    mutationKey: getPostMigrateBackupsMutationKey(),
    async mutationFn() {
      return parseResponse(client.migrate.backups.$post(undefined, options))
    },
  })
}

export function usePostMigrateBackups<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.backups.$post>>>>
        >,
        TError,
        void,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostMigrateBackupsMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostMigrateBackupsRestoreMutationKey() {
  return ['migrate', '/migrate/backups/restore', 'POST'] as const
}

export function getPostMigrateBackupsRestoreMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<typeof client.migrate.backups.restore.$post>>>
      >
    >,
    TError,
    InferRequestType<typeof client.migrate.backups.restore.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostMigrateBackupsRestoreMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.migrate.backups.restore.$post>) {
      return parseResponse(client.migrate.backups.restore.$post(args, options))
    },
  })
}

export function usePostMigrateBackupsRestore<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<Awaited<ReturnType<typeof client.migrate.backups.restore.$post>>>
          >
        >,
        TError,
        InferRequestType<typeof client.migrate.backups.restore.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostMigrateBackupsRestoreMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getMigrateMigrationsMigrationNameQueryKey(
  args: InferRequestType<(typeof client.migrate.migrations)[':migrationName']['$get']>,
) {
  return ['migrate', '/migrate/migrations/:migrationName', args] as const
}

export function getMigrateMigrationsMigrationNameQueryOptions<
  TData = Awaited<
    ReturnType<
      typeof parseResponse<
        Awaited<ReturnType<(typeof client.migrate.migrations)[':migrationName']['$get']>>
      >
    >
  >,
  TError = DefaultError,
>(
  args: InferRequestType<(typeof client.migrate.migrations)[':migrationName']['$get']>,
  options?: ClientRequestOptions,
) {
  return queryOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<
          Awaited<ReturnType<(typeof client.migrate.migrations)[':migrationName']['$get']>>
        >
      >
    >,
    TError,
    TData,
    ReturnType<typeof getMigrateMigrationsMigrationNameQueryKey>
  >({
    queryKey: getMigrateMigrationsMigrationNameQueryKey(args),
    queryFn({ signal }) {
      return parseResponse(
        client.migrate.migrations[':migrationName'].$get(args, {
          ...options,
          init: { ...options?.init, signal },
        }),
      )
    },
  })
}

export function useMigrateMigrationsMigrationName<
  TData = Awaited<
    ReturnType<
      typeof parseResponse<
        Awaited<ReturnType<(typeof client.migrate.migrations)[':migrationName']['$get']>>
      >
    >
  >,
  TError = DefaultError,
>(
  args: InferRequestType<(typeof client.migrate.migrations)[':migrationName']['$get']>,
  options?: {
    query?: Omit<
      UseQueryOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<
              Awaited<ReturnType<(typeof client.migrate.migrations)[':migrationName']['$get']>>
            >
          >
        >,
        TError,
        TData,
        ReturnType<typeof getMigrateMigrationsMigrationNameQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery(
    {
      ...getMigrateMigrationsMigrationNameQueryOptions<TData, TError>(args, clientOptions),
      ...queryOptions,
    },
    queryClient,
  )
}

export function useSuspenseMigrateMigrationsMigrationName<
  TData = Awaited<
    ReturnType<
      typeof parseResponse<
        Awaited<ReturnType<(typeof client.migrate.migrations)[':migrationName']['$get']>>
      >
    >
  >,
  TError = DefaultError,
>(
  args: InferRequestType<(typeof client.migrate.migrations)[':migrationName']['$get']>,
  options?: {
    query?: Omit<
      UseSuspenseQueryOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<
              Awaited<ReturnType<(typeof client.migrate.migrations)[':migrationName']['$get']>>
            >
          >
        >,
        TError,
        TData,
        ReturnType<typeof getMigrateMigrationsMigrationNameQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery(
    {
      ...getMigrateMigrationsMigrationNameQueryOptions<TData, TError>(args, clientOptions),
      ...queryOptions,
    },
    queryClient,
  )
}

export function getPostMigrateMigrationsMutationKey() {
  return ['migrate', '/migrate/migrations', 'POST'] as const
}

export function getPostMigrateMigrationsMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.migrations.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.migrate.migrations.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostMigrateMigrationsMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.migrate.migrations.$post>) {
      return parseResponse(client.migrate.migrations.$post(args, options))
    },
  })
}

export function usePostMigrateMigrations<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<Awaited<ReturnType<typeof client.migrate.migrations.$post>>>
          >
        >,
        TError,
        InferRequestType<typeof client.migrate.migrations.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostMigrateMigrationsMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostMigrateMigrationsAppliedMutationKey() {
  return ['migrate', '/migrate/migrations/applied', 'POST'] as const
}

export function getPostMigrateMigrationsAppliedMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<typeof client.migrate.migrations.applied.$post>>>
      >
    >,
    TError,
    InferRequestType<typeof client.migrate.migrations.applied.$post>,
    TOnMutateResult
  >({
    mutationKey: getPostMigrateMigrationsAppliedMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.migrate.migrations.applied.$post>) {
      return parseResponse(client.migrate.migrations.applied.$post(args, options))
    },
  })
}

export function usePostMigrateMigrationsApplied<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<
              Awaited<ReturnType<typeof client.migrate.migrations.applied.$post>>
            >
          >
        >,
        TError,
        InferRequestType<typeof client.migrate.migrations.applied.$post>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostMigrateMigrationsAppliedMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostMigrateMigrationsRolledBackMutationKey() {
  return ['migrate', '/migrate/migrations/rolled-back', 'POST'] as const
}

export function getPostMigrateMigrationsRolledBackMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<
          Awaited<ReturnType<(typeof client.migrate.migrations)['rolled-back']['$post']>>
        >
      >
    >,
    TError,
    InferRequestType<(typeof client.migrate.migrations)['rolled-back']['$post']>,
    TOnMutateResult
  >({
    mutationKey: getPostMigrateMigrationsRolledBackMutationKey(),
    async mutationFn(
      args: InferRequestType<(typeof client.migrate.migrations)['rolled-back']['$post']>,
    ) {
      return parseResponse(client.migrate.migrations['rolled-back'].$post(args, options))
    },
  })
}

export function usePostMigrateMigrationsRolledBack<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<
              Awaited<ReturnType<(typeof client.migrate.migrations)['rolled-back']['$post']>>
            >
          >
        >,
        TError,
        InferRequestType<(typeof client.migrate.migrations)['rolled-back']['$post']>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostMigrateMigrationsRolledBackMutationOptions<
    TError,
    TOnMutateResult
  >(clientOptions)
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getMigrateDecisionsQueryKey() {
  return ['migrate', '/migrate/decisions'] as const
}

export function getMigrateDecisionsQueryOptions<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.decisions.$get>>>>
  >,
  TError = DefaultError,
>(options?: ClientRequestOptions) {
  return queryOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.decisions.$get>>>>
    >,
    TError,
    TData,
    ReturnType<typeof getMigrateDecisionsQueryKey>
  >({
    queryKey: getMigrateDecisionsQueryKey(),
    queryFn({ signal }) {
      return parseResponse(
        client.migrate.decisions.$get(undefined, {
          ...options,
          init: { ...options?.init, signal },
        }),
      )
    },
  })
}

export function useMigrateDecisions<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.decisions.$get>>>>
  >,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseQueryOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<Awaited<ReturnType<typeof client.migrate.decisions.$get>>>
          >
        >,
        TError,
        TData,
        ReturnType<typeof getMigrateDecisionsQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery(
    { ...getMigrateDecisionsQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function useSuspenseMigrateDecisions<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.decisions.$get>>>>
  >,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseSuspenseQueryOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<Awaited<ReturnType<typeof client.migrate.decisions.$get>>>
          >
        >,
        TError,
        TData,
        ReturnType<typeof getMigrateDecisionsQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery(
    { ...getMigrateDecisionsQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function getPutMigrateDecisionsMutationKey() {
  return ['migrate', '/migrate/decisions', 'PUT'] as const
}

export function getPutMigrateDecisionsMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.decisions.$put>>>>
    >,
    TError,
    InferRequestType<typeof client.migrate.decisions.$put>,
    TOnMutateResult
  >({
    mutationKey: getPutMigrateDecisionsMutationKey(),
    async mutationFn(args: InferRequestType<typeof client.migrate.decisions.$put>) {
      return parseResponse(client.migrate.decisions.$put(args, options))
    },
  })
}

export function usePutMigrateDecisions<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<
            typeof parseResponse<Awaited<ReturnType<typeof client.migrate.decisions.$put>>>
          >
        >,
        TError,
        InferRequestType<typeof client.migrate.decisions.$put>,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPutMigrateDecisionsMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getPostMigrateDeployMutationKey() {
  return ['migrate', '/migrate/deploy', 'POST'] as const
}

export function getPostMigrateDeployMutationOptions<
  TError = DefaultError,
  TOnMutateResult = unknown,
>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.deploy.$post>>>>
    >,
    TError,
    void,
    TOnMutateResult
  >({
    mutationKey: getPostMigrateDeployMutationKey(),
    async mutationFn() {
      return parseResponse(client.migrate.deploy.$post(undefined, options))
    },
  })
}

export function usePostMigrateDeploy<TError = DefaultError, TOnMutateResult = unknown>(
  options?: {
    mutation?: Omit<
      UseMutationOptions<
        Awaited<
          ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.deploy.$post>>>>
        >,
        TError,
        void,
        TOnMutateResult
      >,
      'mutationFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  const mutationDefaults = getPostMigrateDeployMutationOptions<TError, TOnMutateResult>(
    clientOptions,
  )
  return useMutation(
    {
      ...mutationOptions,
      ...mutationDefaults,
      mutationKey: mutationOptions?.mutationKey ?? mutationDefaults.mutationKey,
    },
    queryClient,
  )
}

export function getDocsQueryKey() {
  return ['docs', '/docs'] as const
}

export function getDocsQueryOptions<
  TData = Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.docs.$get>>>>>,
  TError = DefaultError,
>(options?: ClientRequestOptions) {
  return queryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.docs.$get>>>>>,
    TError,
    TData,
    ReturnType<typeof getDocsQueryKey>
  >({
    queryKey: getDocsQueryKey(),
    queryFn({ signal }) {
      return parseResponse(
        client.docs.$get(undefined, { ...options, init: { ...options?.init, signal } }),
      )
    },
  })
}

export function useDocs<
  TData = Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.docs.$get>>>>>,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseQueryOptions<
        Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.docs.$get>>>>>,
        TError,
        TData,
        ReturnType<typeof getDocsQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery(
    { ...getDocsQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}

export function useSuspenseDocs<
  TData = Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.docs.$get>>>>>,
  TError = DefaultError,
>(
  options?: {
    query?: Omit<
      UseSuspenseQueryOptions<
        Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.docs.$get>>>>>,
        TError,
        TData,
        ReturnType<typeof getDocsQueryKey>
      >,
      'queryKey' | 'queryFn'
    >
    options?: ClientRequestOptions
  },
  queryClient?: QueryClient,
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery(
    { ...getDocsQueryOptions<TData, TError>(clientOptions), ...queryOptions },
    queryClient,
  )
}
