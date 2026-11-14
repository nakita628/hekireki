// codegen.js is part of the oxlint JS plugin, so it is written in plain JS. Types are only needed
// for the parts the verification suite touches.

/** Behind `custom/generator-option-documented`: the options a README row gives a provider. */
export declare function documentedOptions(readme: string, provider: string): string[] | null

export declare const codegenRules: Record<string, unknown>
