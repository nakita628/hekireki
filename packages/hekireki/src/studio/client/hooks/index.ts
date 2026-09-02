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
import { client } from '../lib/client.js'

export function getDbKey() {
  return ['db'] as const
}

export function getDocsKey() {
  return ['docs'] as const
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
