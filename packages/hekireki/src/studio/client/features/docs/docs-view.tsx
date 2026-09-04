import { useLocation } from '@tanstack/react-router'
import { useEffect } from 'react'

import { Models } from './models.js'
import { Toc } from './toc.js'
import { Types } from './types.js'

type DocsTypeRef = {
  readonly type: string
  readonly isList: boolean
  readonly location:
    | 'scalar'
    | 'inputObjectTypes'
    | 'outputObjectTypes'
    | 'enumTypes'
    | 'fieldRefTypes'
}

type DocsType = {
  readonly name: string
  readonly fields: readonly {
    readonly name: string
    readonly types: readonly DocsTypeRef[]
    readonly nullable: boolean
  }[]
}

// The generated documentation as the API sends it; the sections below take the slices they read.
type Docs = {
  readonly models: readonly {
    readonly name: string
    readonly documentation: string | null
    readonly directives: readonly { readonly name: string; readonly values: readonly string[] }[]
    readonly fields: readonly {
      readonly name: string
      readonly type: string
      readonly bareTypeName: string
      readonly kind: 'scalar' | 'object' | 'enum' | 'unsupported'
      readonly directives: readonly string[]
      readonly documentation: string | null
      readonly required: boolean
    }[]
    readonly operations: readonly {
      readonly name: string
      readonly description: string
      readonly usage: string
      readonly inputs:
        | readonly {
            readonly name: string
            readonly types: readonly DocsTypeRef[]
            readonly required: boolean
          }[]
        | null
      readonly output: {
        readonly type: string | null
        readonly required: boolean
        readonly list: boolean
      }
    }[]
  }[]
  readonly inputTypes: readonly DocsType[]
  readonly outputTypes: readonly DocsType[]
  readonly enumTypes: readonly { readonly name: string; readonly values: readonly string[] }[]
}

/** The generated documentation: a table of contents, the models with their client operations, then the client API types. */
export function DocsView({ docs }: { readonly docs: Docs }) {
  const hash = useLocation({ select: (location) => location.hash })

  // The docs arrive after the page, so a hash in the opening URL (or one the router restored)
  // has nothing to scroll to until the sections exist; the browser only scrolls on a click.
  useEffect(() => {
    if (hash === '' || docs.models.length === 0) return
    document.getElementById(decodeURIComponent(hash))?.scrollIntoView()
  }, [hash, docs])

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <Toc docs={docs} />
      <article className="min-h-0 flex-1 overflow-y-auto">
        <Models docs={docs} />
        <Types docs={docs} />
      </article>
    </div>
  )
}
