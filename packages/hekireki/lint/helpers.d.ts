// helpers.js is plain JS (it runs inside oxlint); these are the types the verification suite needs.

/** The Studio server layer a file belongs to, or null outside them. */
export declare function layerOf(
  filename: string,
): 'handlers' | 'usecases' | 'services' | 'domain' | 'errors' | null

/** A relative import specifier joined onto the importing file's directory, or null for a bare one. */
export declare function resolveRelative(filename: string, specifier: string): string | null
