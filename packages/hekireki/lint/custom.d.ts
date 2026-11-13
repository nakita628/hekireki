// custom.js is an oxlint JS plugin (the alpha ESLint-compatible API), so it is written in
// plain JS. Types are only needed for the parts the verification suite touches.

/** Import-target check behind `custom/layer-namespace-import`: the layer module an import points at. */
export declare function layerModuleOf(
  filename: string,
  source: string,
): {
  readonly layer: 'usecases' | 'services' | 'domain'
  readonly module: string
  readonly sibling: boolean
} | null

/** The namespace a layer module is imported as (`PrismaUseCase`, `DatabaseErrorDomain`). */
export declare function layerNamespaceOf(
  layer: 'usecases' | 'services' | 'domain',
  module: string,
): string

declare const plugin: {
  readonly meta: { readonly name: string }
  readonly rules: Record<string, unknown>
}

export default plugin

/** Behind `custom/handler-doc`: the use cases a handler calls and the `Match.tag` names it answers. */
export declare function handlerDocNames(body: string): readonly string[]
