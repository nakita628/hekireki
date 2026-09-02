// custom.js is an oxlint JS plugin (the alpha ESLint-compatible API), so it is written in
// plain JS. Types are only needed for the parts the verification suite touches.

/** File-scope check behind `custom/no-usecase-to-usecase` and `custom/usecase-gen-straight-line`. */
export declare function isUseCaseModulePath(filename: string): boolean

/** File-scope check behind `custom/no-null-coercion-map`. */
export declare function isServiceModulePath(filename: string): boolean

/** Import-target check behind `custom/no-usecase-to-usecase`. */
export declare function isUseCaseSpecifier(source: string): boolean

/** Whether a path is a test file (exempt from the structural rules). */
export declare function isTestPath(filename: string): boolean

declare const plugin: {
  readonly meta: { readonly name: string }
  readonly rules: Record<string, unknown>
}

export default plugin
