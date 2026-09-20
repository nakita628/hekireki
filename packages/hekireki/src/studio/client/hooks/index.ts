import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  queryOptions,
  mutationOptions,
} from '@tanstack/react-query'
import type {
  UseQueryOptions,
  QueryFunctionContext,
  UseSuspenseQueryOptions,
  UseMutationOptions,
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

export function getSchemaQueryOptions(options?: ClientRequestOptions) {
  return queryOptions({
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
  TError = unknown,
>(options?: {
  query?: UseQueryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.$get>>>>>,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery({
    ...queryOptions,
    queryKey: getSchemaQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.schema.$get(undefined, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function useSuspenseSchema<
  TData = Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.$get>>>>>,
  TError = unknown,
>(options?: {
  query?: UseSuspenseQueryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.$get>>>>>,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery({
    ...queryOptions,
    queryKey: getSchemaQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.schema.$get(undefined, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function getPostSchemaReloadMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.reload.$post>>>>
    >,
    TError,
    void
  >({
    mutationKey: ['schema', '/schema/reload', 'POST'] as const,
    async mutationFn() {
      return parseResponse(client.schema.reload.$post(undefined, options))
    },
  })
}

export function usePostSchemaReload<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.reload.$post>>>>
    >,
    TError,
    void
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostSchemaReloadMutationOptions<TError>(clientOptions),
  })
}

export function getPutSchemaFilesMutationOptions<TError = unknown>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.files.$put>>>>>,
    TError,
    InferRequestType<typeof client.schema.files.$put>
  >({
    mutationKey: ['schema', '/schema/files', 'PUT'] as const,
    async mutationFn(args: InferRequestType<typeof client.schema.files.$put>) {
      return parseResponse(client.schema.files.$put(args, options))
    },
  })
}

export function usePutSchemaFiles<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.files.$put>>>>>,
    TError,
    InferRequestType<typeof client.schema.files.$put>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPutSchemaFilesMutationOptions<TError>(clientOptions),
  })
}

export function getSchemaEventsQueryKey() {
  return ['schema', '/schema/events'] as const
}

export function getSchemaEventsQueryOptions(options?: ClientRequestOptions) {
  return queryOptions({
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
  TError = unknown,
>(options?: {
  query?: UseQueryOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.events.$get>>>>
    >,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery({
    ...queryOptions,
    queryKey: getSchemaEventsQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.schema.events.$get(undefined, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function useSuspenseSchemaEvents<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.events.$get>>>>
  >,
  TError = unknown,
>(options?: {
  query?: UseSuspenseQueryOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.schema.events.$get>>>>
    >,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery({
    ...queryOptions,
    queryKey: getSchemaEventsQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.schema.events.$get(undefined, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function getDbQueryKey() {
  return ['db', '/db'] as const
}

export function getDbQueryOptions(options?: ClientRequestOptions) {
  return queryOptions({
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
  TError = unknown,
>(options?: {
  query?: UseQueryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.$get>>>>>,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery({
    ...queryOptions,
    queryKey: getDbQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.db.$get(undefined, { ...clientOptions, init: { ...clientOptions?.init, signal } }),
      )
    },
  })
}

export function useSuspenseDb<
  TData = Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.$get>>>>>,
  TError = unknown,
>(options?: {
  query?: UseSuspenseQueryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.$get>>>>>,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery({
    ...queryOptions,
    queryKey: getDbQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.db.$get(undefined, { ...clientOptions, init: { ...clientOptions?.init, signal } }),
      )
    },
  })
}

export function getDbCountsQueryKey() {
  return ['db', '/db/counts'] as const
}

export function getDbCountsQueryOptions(options?: ClientRequestOptions) {
  return queryOptions({
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
  TError = unknown,
>(options?: {
  query?: UseQueryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.counts.$get>>>>>,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery({
    ...queryOptions,
    queryKey: getDbCountsQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.db.counts.$get(undefined, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function useSuspenseDbCounts<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.counts.$get>>>>
  >,
  TError = unknown,
>(options?: {
  query?: UseSuspenseQueryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.counts.$get>>>>>,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery({
    ...queryOptions,
    queryKey: getDbCountsQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.db.counts.$get(undefined, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function getDbRowsModelNameQueryKey(
  args: InferRequestType<(typeof client.db.rows)[':modelName']['$get']>,
) {
  return ['db', '/db/rows/:modelName', args] as const
}

export function getDbRowsModelNameQueryOptions(
  args: InferRequestType<(typeof client.db.rows)[':modelName']['$get']>,
  options?: ClientRequestOptions,
) {
  return queryOptions({
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
  TError = unknown,
>(
  args: InferRequestType<(typeof client.db.rows)[':modelName']['$get']>,
  options?: {
    query?: UseQueryOptions<
      Awaited<
        ReturnType<
          typeof parseResponse<Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$get']>>>
        >
      >,
      TError,
      TData
    >
    options?: ClientRequestOptions
  },
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery({
    ...queryOptions,
    queryKey: getDbRowsModelNameQueryKey(args),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.db.rows[':modelName'].$get(args, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function useSuspenseDbRowsModelName<
  TData = Awaited<
    ReturnType<
      typeof parseResponse<Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$get']>>>
    >
  >,
  TError = unknown,
>(
  args: InferRequestType<(typeof client.db.rows)[':modelName']['$get']>,
  options?: {
    query?: UseSuspenseQueryOptions<
      Awaited<
        ReturnType<
          typeof parseResponse<Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$get']>>>
        >
      >,
      TError,
      TData
    >
    options?: ClientRequestOptions
  },
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery({
    ...queryOptions,
    queryKey: getDbRowsModelNameQueryKey(args),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.db.rows[':modelName'].$get(args, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function getPostDbRowsModelNameMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$post']>>>
      >
    >,
    TError,
    InferRequestType<(typeof client.db.rows)[':modelName']['$post']>
  >({
    mutationKey: ['db', '/db/rows/:modelName', 'POST'] as const,
    async mutationFn(args: InferRequestType<(typeof client.db.rows)[':modelName']['$post']>) {
      return parseResponse(client.db.rows[':modelName'].$post(args, options))
    },
  })
}

export function usePostDbRowsModelName<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$post']>>>
      >
    >,
    TError,
    InferRequestType<(typeof client.db.rows)[':modelName']['$post']>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostDbRowsModelNameMutationOptions<TError>(clientOptions),
  })
}

export function getDeleteDbRowsModelNameMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$delete']>>>
      >
    >,
    TError,
    InferRequestType<(typeof client.db.rows)[':modelName']['$delete']>
  >({
    mutationKey: ['db', '/db/rows/:modelName', 'DELETE'] as const,
    async mutationFn(args: InferRequestType<(typeof client.db.rows)[':modelName']['$delete']>) {
      return parseResponse(client.db.rows[':modelName'].$delete(args, options))
    },
  })
}

export function useDeleteDbRowsModelName<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$delete']>>>
      >
    >,
    TError,
    InferRequestType<(typeof client.db.rows)[':modelName']['$delete']>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getDeleteDbRowsModelNameMutationOptions<TError>(clientOptions),
  })
}

export function getPatchDbRowsModelNameMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$patch']>>>
      >
    >,
    TError,
    InferRequestType<(typeof client.db.rows)[':modelName']['$patch']>
  >({
    mutationKey: ['db', '/db/rows/:modelName', 'PATCH'] as const,
    async mutationFn(args: InferRequestType<(typeof client.db.rows)[':modelName']['$patch']>) {
      return parseResponse(client.db.rows[':modelName'].$patch(args, options))
    },
  })
}

export function usePatchDbRowsModelName<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<(typeof client.db.rows)[':modelName']['$patch']>>>
      >
    >,
    TError,
    InferRequestType<(typeof client.db.rows)[':modelName']['$patch']>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPatchDbRowsModelNameMutationOptions<TError>(clientOptions),
  })
}

export function getPostDbSqlMutationOptions<TError = unknown>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.sql.$post>>>>>,
    TError,
    InferRequestType<typeof client.db.sql.$post>
  >({
    mutationKey: ['db', '/db/sql', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.db.sql.$post>) {
      return parseResponse(client.db.sql.$post(args, options))
    },
  })
}

export function usePostDbSql<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.sql.$post>>>>>,
    TError,
    InferRequestType<typeof client.db.sql.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({ ...mutationOptions, ...getPostDbSqlMutationOptions<TError>(clientOptions) })
}

export function getPostDbExplainMutationOptions<TError = unknown>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.explain.$post>>>>>,
    TError,
    InferRequestType<typeof client.db.explain.$post>
  >({
    mutationKey: ['db', '/db/explain', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.db.explain.$post>) {
      return parseResponse(client.db.explain.$post(args, options))
    },
  })
}

export function usePostDbExplain<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.explain.$post>>>>>,
    TError,
    InferRequestType<typeof client.db.explain.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostDbExplainMutationOptions<TError>(clientOptions),
  })
}

export function getPostDbAnalyzeMutationOptions<TError = unknown>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.analyze.$post>>>>>,
    TError,
    InferRequestType<typeof client.db.analyze.$post>
  >({
    mutationKey: ['db', '/db/analyze', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.db.analyze.$post>) {
      return parseResponse(client.db.analyze.$post(args, options))
    },
  })
}

export function usePostDbAnalyze<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.db.analyze.$post>>>>>,
    TError,
    InferRequestType<typeof client.db.analyze.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostDbAnalyzeMutationOptions<TError>(clientOptions),
  })
}

export function getClientQueryKey() {
  return ['client', '/client'] as const
}

export function getClientQueryOptions(options?: ClientRequestOptions) {
  return queryOptions({
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
  TError = unknown,
>(options?: {
  query?: UseQueryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.$get>>>>>,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery({
    ...queryOptions,
    queryKey: getClientQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.client.$get(undefined, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function useSuspenseClient<
  TData = Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.$get>>>>>,
  TError = unknown,
>(options?: {
  query?: UseSuspenseQueryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.$get>>>>>,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery({
    ...queryOptions,
    queryKey: getClientQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.client.$get(undefined, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function getPostClientAnalyzeMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.analyze.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.analyze.$post>
  >({
    mutationKey: ['client', '/client/analyze', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.client.analyze.$post>) {
      return parseResponse(client.client.analyze.$post(args, options))
    },
  })
}

export function usePostClientAnalyze<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.analyze.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.analyze.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostClientAnalyzeMutationOptions<TError>(clientOptions),
  })
}

export function getPostClientCompleteMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.complete.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.complete.$post>
  >({
    mutationKey: ['client', '/client/complete', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.client.complete.$post>) {
      return parseResponse(client.client.complete.$post(args, options))
    },
  })
}

export function usePostClientComplete<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.complete.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.complete.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostClientCompleteMutationOptions<TError>(clientOptions),
  })
}

export function getPostClientCompleteDetailMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<typeof client.client.complete.detail.$post>>>
      >
    >,
    TError,
    InferRequestType<typeof client.client.complete.detail.$post>
  >({
    mutationKey: ['client', '/client/complete/detail', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.client.complete.detail.$post>) {
      return parseResponse(client.client.complete.detail.$post(args, options))
    },
  })
}

export function usePostClientCompleteDetail<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<typeof client.client.complete.detail.$post>>>
      >
    >,
    TError,
    InferRequestType<typeof client.client.complete.detail.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostClientCompleteDetailMutationOptions<TError>(clientOptions),
  })
}

export function getPostClientHoverMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.hover.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.hover.$post>
  >({
    mutationKey: ['client', '/client/hover', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.client.hover.$post>) {
      return parseResponse(client.client.hover.$post(args, options))
    },
  })
}

export function usePostClientHover<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.hover.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.hover.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostClientHoverMutationOptions<TError>(clientOptions),
  })
}

export function getPostClientSignatureMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.signature.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.signature.$post>
  >({
    mutationKey: ['client', '/client/signature', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.client.signature.$post>) {
      return parseResponse(client.client.signature.$post(args, options))
    },
  })
}

export function usePostClientSignature<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.signature.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.signature.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostClientSignatureMutationOptions<TError>(clientOptions),
  })
}

export function getPostClientFormatMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.format.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.format.$post>
  >({
    mutationKey: ['client', '/client/format', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.client.format.$post>) {
      return parseResponse(client.client.format.$post(args, options))
    },
  })
}

export function usePostClientFormat<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.format.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.format.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostClientFormatMutationOptions<TError>(clientOptions),
  })
}

export function getPostClientCheckMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.check.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.check.$post>
  >({
    mutationKey: ['client', '/client/check', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.client.check.$post>) {
      return parseResponse(client.client.check.$post(args, options))
    },
  })
}

export function usePostClientCheck<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.check.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.check.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostClientCheckMutationOptions<TError>(clientOptions),
  })
}

export function getPostClientPreviewMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.preview.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.preview.$post>
  >({
    mutationKey: ['client', '/client/preview', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.client.preview.$post>) {
      return parseResponse(client.client.preview.$post(args, options))
    },
  })
}

export function usePostClientPreview<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.preview.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.client.preview.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostClientPreviewMutationOptions<TError>(clientOptions),
  })
}

export function getPostClientRunMutationOptions<TError = unknown>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.run.$post>>>>>,
    TError,
    InferRequestType<typeof client.client.run.$post>
  >({
    mutationKey: ['client', '/client/run', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.client.run.$post>) {
      return parseResponse(client.client.run.$post(args, options))
    },
  })
}

export function usePostClientRun<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.client.run.$post>>>>>,
    TError,
    InferRequestType<typeof client.client.run.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostClientRunMutationOptions<TError>(clientOptions),
  })
}

export function getPostPrismaFormatMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.format.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.format.$post>
  >({
    mutationKey: ['prisma', '/prisma/format', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.prisma.format.$post>) {
      return parseResponse(client.prisma.format.$post(args, options))
    },
  })
}

export function usePostPrismaFormat<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.format.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.format.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostPrismaFormatMutationOptions<TError>(clientOptions),
  })
}

export function getPostPrismaLintMutationOptions<TError = unknown>(options?: ClientRequestOptions) {
  return mutationOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.lint.$post>>>>>,
    TError,
    InferRequestType<typeof client.prisma.lint.$post>
  >({
    mutationKey: ['prisma', '/prisma/lint', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.prisma.lint.$post>) {
      return parseResponse(client.prisma.lint.$post(args, options))
    },
  })
}

export function usePostPrismaLint<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.lint.$post>>>>>,
    TError,
    InferRequestType<typeof client.prisma.lint.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostPrismaLintMutationOptions<TError>(clientOptions),
  })
}

export function getPostPrismaSymbolsMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.symbols.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.symbols.$post>
  >({
    mutationKey: ['prisma', '/prisma/symbols', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.prisma.symbols.$post>) {
      return parseResponse(client.prisma.symbols.$post(args, options))
    },
  })
}

export function usePostPrismaSymbols<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.symbols.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.symbols.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostPrismaSymbolsMutationOptions<TError>(clientOptions),
  })
}

export function getPostPrismaCompleteMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.complete.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.complete.$post>
  >({
    mutationKey: ['prisma', '/prisma/complete', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.prisma.complete.$post>) {
      return parseResponse(client.prisma.complete.$post(args, options))
    },
  })
}

export function usePostPrismaComplete<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.complete.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.complete.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostPrismaCompleteMutationOptions<TError>(clientOptions),
  })
}

export function getPostPrismaHoverMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.hover.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.hover.$post>
  >({
    mutationKey: ['prisma', '/prisma/hover', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.prisma.hover.$post>) {
      return parseResponse(client.prisma.hover.$post(args, options))
    },
  })
}

export function usePostPrismaHover<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.hover.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.hover.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostPrismaHoverMutationOptions<TError>(clientOptions),
  })
}

export function getPostPrismaDefinitionMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.definition.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.definition.$post>
  >({
    mutationKey: ['prisma', '/prisma/definition', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.prisma.definition.$post>) {
      return parseResponse(client.prisma.definition.$post(args, options))
    },
  })
}

export function usePostPrismaDefinition<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.definition.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.definition.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostPrismaDefinitionMutationOptions<TError>(clientOptions),
  })
}

export function getPostPrismaReferencesMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.references.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.references.$post>
  >({
    mutationKey: ['prisma', '/prisma/references', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.prisma.references.$post>) {
      return parseResponse(client.prisma.references.$post(args, options))
    },
  })
}

export function usePostPrismaReferences<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.references.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.references.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostPrismaReferencesMutationOptions<TError>(clientOptions),
  })
}

export function getPostPrismaRenameMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.rename.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.rename.$post>
  >({
    mutationKey: ['prisma', '/prisma/rename', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.prisma.rename.$post>) {
      return parseResponse(client.prisma.rename.$post(args, options))
    },
  })
}

export function usePostPrismaRename<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.prisma.rename.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.prisma.rename.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostPrismaRenameMutationOptions<TError>(clientOptions),
  })
}

export function getPostPrismaCodeActionsMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<(typeof client.prisma)['code-actions']['$post']>>>
      >
    >,
    TError,
    InferRequestType<(typeof client.prisma)['code-actions']['$post']>
  >({
    mutationKey: ['prisma', '/prisma/code-actions', 'POST'] as const,
    async mutationFn(args: InferRequestType<(typeof client.prisma)['code-actions']['$post']>) {
      return parseResponse(client.prisma['code-actions'].$post(args, options))
    },
  })
}

export function usePostPrismaCodeActions<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<(typeof client.prisma)['code-actions']['$post']>>>
      >
    >,
    TError,
    InferRequestType<(typeof client.prisma)['code-actions']['$post']>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostPrismaCodeActionsMutationOptions<TError>(clientOptions),
  })
}

export function getMigrateQueryKey() {
  return ['migrate', '/migrate'] as const
}

export function getMigrateQueryOptions(options?: ClientRequestOptions) {
  return queryOptions({
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
  TError = unknown,
>(options?: {
  query?: UseQueryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.$get>>>>>,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery({
    ...queryOptions,
    queryKey: getMigrateQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.migrate.$get(undefined, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function useSuspenseMigrate<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.$get>>>>
  >,
  TError = unknown,
>(options?: {
  query?: UseSuspenseQueryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.$get>>>>>,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery({
    ...queryOptions,
    queryKey: getMigrateQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.migrate.$get(undefined, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function getMigrateBaselineQueryKey() {
  return ['migrate', '/migrate/baseline'] as const
}

export function getMigrateBaselineQueryOptions(options?: ClientRequestOptions) {
  return queryOptions({
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
  TError = unknown,
>(options?: {
  query?: UseQueryOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.baseline.$get>>>>
    >,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery({
    ...queryOptions,
    queryKey: getMigrateBaselineQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.migrate.baseline.$get(undefined, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function useSuspenseMigrateBaseline<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.baseline.$get>>>>
  >,
  TError = unknown,
>(options?: {
  query?: UseSuspenseQueryOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.baseline.$get>>>>
    >,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery({
    ...queryOptions,
    queryKey: getMigrateBaselineQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.migrate.baseline.$get(undefined, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function getPostMigrateBaselineMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.baseline.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.migrate.baseline.$post>
  >({
    mutationKey: ['migrate', '/migrate/baseline', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.migrate.baseline.$post>) {
      return parseResponse(client.migrate.baseline.$post(args, options))
    },
  })
}

export function usePostMigrateBaseline<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.baseline.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.migrate.baseline.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostMigrateBaselineMutationOptions<TError>(clientOptions),
  })
}

export function getMigrateDiffQueryKey() {
  return ['migrate', '/migrate/diff'] as const
}

export function getMigrateDiffQueryOptions(options?: ClientRequestOptions) {
  return queryOptions({
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
  TError = unknown,
>(options?: {
  query?: UseQueryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.diff.$get>>>>>,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery({
    ...queryOptions,
    queryKey: getMigrateDiffQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.migrate.diff.$get(undefined, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function useSuspenseMigrateDiff<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.diff.$get>>>>
  >,
  TError = unknown,
>(options?: {
  query?: UseSuspenseQueryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.diff.$get>>>>>,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery({
    ...queryOptions,
    queryKey: getMigrateDiffQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.migrate.diff.$get(undefined, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function getPostMigratePlanMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.plan.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.migrate.plan.$post>
  >({
    mutationKey: ['migrate', '/migrate/plan', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.migrate.plan.$post>) {
      return parseResponse(client.migrate.plan.$post(args, options))
    },
  })
}

export function usePostMigratePlan<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.plan.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.migrate.plan.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostMigratePlanMutationOptions<TError>(clientOptions),
  })
}

export function getPostMigrateApplyMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.apply.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.migrate.apply.$post>
  >({
    mutationKey: ['migrate', '/migrate/apply', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.migrate.apply.$post>) {
      return parseResponse(client.migrate.apply.$post(args, options))
    },
  })
}

export function usePostMigrateApply<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.apply.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.migrate.apply.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostMigrateApplyMutationOptions<TError>(clientOptions),
  })
}

export function getPostMigrateRehearseMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.rehearse.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.migrate.rehearse.$post>
  >({
    mutationKey: ['migrate', '/migrate/rehearse', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.migrate.rehearse.$post>) {
      return parseResponse(client.migrate.rehearse.$post(args, options))
    },
  })
}

export function usePostMigrateRehearse<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.rehearse.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.migrate.rehearse.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostMigrateRehearseMutationOptions<TError>(clientOptions),
  })
}

export function getMigrateTablesQueryKey() {
  return ['migrate', '/migrate/tables'] as const
}

export function getMigrateTablesQueryOptions(options?: ClientRequestOptions) {
  return queryOptions({
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
  TError = unknown,
>(options?: {
  query?: UseQueryOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.tables.$get>>>>
    >,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery({
    ...queryOptions,
    queryKey: getMigrateTablesQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.migrate.tables.$get(undefined, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function useSuspenseMigrateTables<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.tables.$get>>>>
  >,
  TError = unknown,
>(options?: {
  query?: UseSuspenseQueryOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.tables.$get>>>>
    >,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery({
    ...queryOptions,
    queryKey: getMigrateTablesQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.migrate.tables.$get(undefined, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function getMigrateBackupsQueryKey() {
  return ['migrate', '/migrate/backups'] as const
}

export function getMigrateBackupsQueryOptions(options?: ClientRequestOptions) {
  return queryOptions({
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
  TError = unknown,
>(options?: {
  query?: UseQueryOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.backups.$get>>>>
    >,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery({
    ...queryOptions,
    queryKey: getMigrateBackupsQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.migrate.backups.$get(undefined, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function useSuspenseMigrateBackups<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.backups.$get>>>>
  >,
  TError = unknown,
>(options?: {
  query?: UseSuspenseQueryOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.backups.$get>>>>
    >,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery({
    ...queryOptions,
    queryKey: getMigrateBackupsQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.migrate.backups.$get(undefined, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function getPostMigrateBackupsMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.backups.$post>>>>
    >,
    TError,
    void
  >({
    mutationKey: ['migrate', '/migrate/backups', 'POST'] as const,
    async mutationFn() {
      return parseResponse(client.migrate.backups.$post(undefined, options))
    },
  })
}

export function usePostMigrateBackups<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.backups.$post>>>>
    >,
    TError,
    void
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostMigrateBackupsMutationOptions<TError>(clientOptions),
  })
}

export function getPostMigrateBackupsRestoreMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<typeof client.migrate.backups.restore.$post>>>
      >
    >,
    TError,
    InferRequestType<typeof client.migrate.backups.restore.$post>
  >({
    mutationKey: ['migrate', '/migrate/backups/restore', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.migrate.backups.restore.$post>) {
      return parseResponse(client.migrate.backups.restore.$post(args, options))
    },
  })
}

export function usePostMigrateBackupsRestore<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<typeof client.migrate.backups.restore.$post>>>
      >
    >,
    TError,
    InferRequestType<typeof client.migrate.backups.restore.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostMigrateBackupsRestoreMutationOptions<TError>(clientOptions),
  })
}

export function getMigrateMigrationsMigrationNameQueryKey(
  args: InferRequestType<(typeof client.migrate.migrations)[':migrationName']['$get']>,
) {
  return ['migrate', '/migrate/migrations/:migrationName', args] as const
}

export function getMigrateMigrationsMigrationNameQueryOptions(
  args: InferRequestType<(typeof client.migrate.migrations)[':migrationName']['$get']>,
  options?: ClientRequestOptions,
) {
  return queryOptions({
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
  TError = unknown,
>(
  args: InferRequestType<(typeof client.migrate.migrations)[':migrationName']['$get']>,
  options?: {
    query?: UseQueryOptions<
      Awaited<
        ReturnType<
          typeof parseResponse<
            Awaited<ReturnType<(typeof client.migrate.migrations)[':migrationName']['$get']>>
          >
        >
      >,
      TError,
      TData
    >
    options?: ClientRequestOptions
  },
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery({
    ...queryOptions,
    queryKey: getMigrateMigrationsMigrationNameQueryKey(args),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.migrate.migrations[':migrationName'].$get(args, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function useSuspenseMigrateMigrationsMigrationName<
  TData = Awaited<
    ReturnType<
      typeof parseResponse<
        Awaited<ReturnType<(typeof client.migrate.migrations)[':migrationName']['$get']>>
      >
    >
  >,
  TError = unknown,
>(
  args: InferRequestType<(typeof client.migrate.migrations)[':migrationName']['$get']>,
  options?: {
    query?: UseSuspenseQueryOptions<
      Awaited<
        ReturnType<
          typeof parseResponse<
            Awaited<ReturnType<(typeof client.migrate.migrations)[':migrationName']['$get']>>
          >
        >
      >,
      TError,
      TData
    >
    options?: ClientRequestOptions
  },
) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery({
    ...queryOptions,
    queryKey: getMigrateMigrationsMigrationNameQueryKey(args),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.migrate.migrations[':migrationName'].$get(args, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function getPostMigrateMigrationsMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.migrations.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.migrate.migrations.$post>
  >({
    mutationKey: ['migrate', '/migrate/migrations', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.migrate.migrations.$post>) {
      return parseResponse(client.migrate.migrations.$post(args, options))
    },
  })
}

export function usePostMigrateMigrations<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.migrations.$post>>>>
    >,
    TError,
    InferRequestType<typeof client.migrate.migrations.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostMigrateMigrationsMutationOptions<TError>(clientOptions),
  })
}

export function getPostMigrateMigrationsAppliedMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<typeof client.migrate.migrations.applied.$post>>>
      >
    >,
    TError,
    InferRequestType<typeof client.migrate.migrations.applied.$post>
  >({
    mutationKey: ['migrate', '/migrate/migrations/applied', 'POST'] as const,
    async mutationFn(args: InferRequestType<typeof client.migrate.migrations.applied.$post>) {
      return parseResponse(client.migrate.migrations.applied.$post(args, options))
    },
  })
}

export function usePostMigrateMigrationsApplied<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<Awaited<ReturnType<typeof client.migrate.migrations.applied.$post>>>
      >
    >,
    TError,
    InferRequestType<typeof client.migrate.migrations.applied.$post>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostMigrateMigrationsAppliedMutationOptions<TError>(clientOptions),
  })
}

export function getPostMigrateMigrationsRolledBackMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<
          Awaited<ReturnType<(typeof client.migrate.migrations)['rolled-back']['$post']>>
        >
      >
    >,
    TError,
    InferRequestType<(typeof client.migrate.migrations)['rolled-back']['$post']>
  >({
    mutationKey: ['migrate', '/migrate/migrations/rolled-back', 'POST'] as const,
    async mutationFn(
      args: InferRequestType<(typeof client.migrate.migrations)['rolled-back']['$post']>,
    ) {
      return parseResponse(client.migrate.migrations['rolled-back'].$post(args, options))
    },
  })
}

export function usePostMigrateMigrationsRolledBack<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<
        typeof parseResponse<
          Awaited<ReturnType<(typeof client.migrate.migrations)['rolled-back']['$post']>>
        >
      >
    >,
    TError,
    InferRequestType<(typeof client.migrate.migrations)['rolled-back']['$post']>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostMigrateMigrationsRolledBackMutationOptions<TError>(clientOptions),
  })
}

export function getMigrateDecisionsQueryKey() {
  return ['migrate', '/migrate/decisions'] as const
}

export function getMigrateDecisionsQueryOptions(options?: ClientRequestOptions) {
  return queryOptions({
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
  TError = unknown,
>(options?: {
  query?: UseQueryOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.decisions.$get>>>>
    >,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery({
    ...queryOptions,
    queryKey: getMigrateDecisionsQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.migrate.decisions.$get(undefined, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function useSuspenseMigrateDecisions<
  TData = Awaited<
    ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.decisions.$get>>>>
  >,
  TError = unknown,
>(options?: {
  query?: UseSuspenseQueryOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.decisions.$get>>>>
    >,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery({
    ...queryOptions,
    queryKey: getMigrateDecisionsQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.migrate.decisions.$get(undefined, {
          ...clientOptions,
          init: { ...clientOptions?.init, signal },
        }),
      )
    },
  })
}

export function getPutMigrateDecisionsMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.decisions.$put>>>>
    >,
    TError,
    InferRequestType<typeof client.migrate.decisions.$put>
  >({
    mutationKey: ['migrate', '/migrate/decisions', 'PUT'] as const,
    async mutationFn(args: InferRequestType<typeof client.migrate.decisions.$put>) {
      return parseResponse(client.migrate.decisions.$put(args, options))
    },
  })
}

export function usePutMigrateDecisions<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.decisions.$put>>>>
    >,
    TError,
    InferRequestType<typeof client.migrate.decisions.$put>
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPutMigrateDecisionsMutationOptions<TError>(clientOptions),
  })
}

export function getPostMigrateDeployMutationOptions<TError = unknown>(
  options?: ClientRequestOptions,
) {
  return mutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.deploy.$post>>>>
    >,
    TError,
    void
  >({
    mutationKey: ['migrate', '/migrate/deploy', 'POST'] as const,
    async mutationFn() {
      return parseResponse(client.migrate.deploy.$post(undefined, options))
    },
  })
}

export function usePostMigrateDeploy<TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<
      ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.migrate.deploy.$post>>>>
    >,
    TError,
    void
  >
  options?: ClientRequestOptions
}) {
  const { mutation: mutationOptions, options: clientOptions } = options ?? {}
  return useMutation({
    ...mutationOptions,
    ...getPostMigrateDeployMutationOptions<TError>(clientOptions),
  })
}

export function getDocsQueryKey() {
  return ['docs', '/docs'] as const
}

export function getDocsQueryOptions(options?: ClientRequestOptions) {
  return queryOptions({
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
  TError = unknown,
>(options?: {
  query?: UseQueryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.docs.$get>>>>>,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useQuery({
    ...queryOptions,
    queryKey: getDocsQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.docs.$get(undefined, { ...clientOptions, init: { ...clientOptions?.init, signal } }),
      )
    },
  })
}

export function useSuspenseDocs<
  TData = Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.docs.$get>>>>>,
  TError = unknown,
>(options?: {
  query?: UseSuspenseQueryOptions<
    Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.docs.$get>>>>>,
    TError,
    TData
  >
  options?: ClientRequestOptions
}) {
  const { query: queryOptions, options: clientOptions } = options ?? {}
  return useSuspenseQuery({
    ...queryOptions,
    queryKey: getDocsQueryKey(),
    queryFn({ signal }: QueryFunctionContext) {
      return parseResponse(
        client.docs.$get(undefined, { ...clientOptions, init: { ...clientOptions?.init, signal } }),
      )
    },
  })
}
