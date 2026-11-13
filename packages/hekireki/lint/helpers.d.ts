/** The Studio server layer a file belongs to, or null outside them. */
export declare function layerOf(
  filename: string,
): 'handlers' | 'usecases' | 'services' | 'domain' | 'errors' | null

/** A relative import specifier joined onto the importing file's directory, or null for a bare one. */
export declare function resolveRelative(filename: string, specifier: string): string | null

/** Whether a file is a module of one Studio server layer: not its barrel, not a test. */
export declare function isLayerModule(filename: string, layer: string): boolean

/** The TSDoc block, markers included, written directly above a node, or null. */
export declare function leadingTsdoc(
  text: string,
  node: { readonly start: number; readonly end: number },
): string | null
