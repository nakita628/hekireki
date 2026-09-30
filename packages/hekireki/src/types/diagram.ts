// The shapes the ER diagram is drawn from and drawn with, shared by the renderer (src/diagram), the
// generator that writes it out, and Studio's canvas, which draws the same models, relations and
// wires as React Flow nodes and edges.
import type { Edge, Node } from '@xyflow/react'

export type Point = { readonly x: number; readonly y: number }

export type Box = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** A wire's path: the corners it turns at, from where it leaves a card to where it comes into one. */
export type Route = readonly Point[]

/** Where a block's top-left corner sits on the canvas. */
export type Position = Point

export type LayoutPositions = Readonly<Record<string, Position>>

export type DiagramTheme = 'light' | 'dark'

/** A block attribute of a model: `@@id`, `@@unique`, `@@index` or `@@fulltext`. */
export type DiagramIndex = {
  readonly type: 'id' | 'normal' | 'unique' | 'fulltext'
  readonly fields: readonly string[]
}

/** What the layout needs of a field to size the row it takes. */
export type DiagramField = {
  readonly kind: string
  readonly type?: string
  readonly documentation: string | null
  readonly attributes?: readonly string[]
}

/** What the layout needs of a model to size its card. */
export type DiagramModel = {
  readonly documentation?: string | null
  readonly fields: readonly DiagramField[]
  readonly indexes?: readonly DiagramIndex[]
}

/** What the layout needs of an enum to size its card. */
export type DiagramEnum = {
  readonly name: string
  readonly documentation?: string | null
  readonly values: readonly unknown[]
}

/** What the layout places: the blocks, and which of them the relations tie together. */
export type DiagramSchema = {
  readonly models: readonly (DiagramModel & { readonly name: string })[]
  readonly relations: readonly {
    readonly from: { readonly model: string }
    readonly to: { readonly model: string }
  }[]
  readonly enums?: readonly DiagramEnum[]
}

export type Cardinality = 'zero-one' | 'one' | 'zero-many' | 'many'

/**
 * Where a relation came from, which is what the drawings dash an edge on — not its cardinality.
 *
 * - `inferred` — a real foreign key column. Drawn solid.
 * - `annotated` — declared in a `/// @relation` comment and nowhere else, so no constraint backs
 *   it. Drawn dashed.
 * - `implicit-many-to-many` — both ends are lists without `@relation(fields:)`, so Prisma keeps
 *   the pairs in a join table of its own and neither model has a column for the other. Drawn
 *   dashed, and hung off the card headers rather than off a field row, because there is no
 *   scalar field at either end to point at.
 *
 * So a dashed edge means "nothing in the database enforces this", not "many to many": an
 * explicit many-to-many written as a join model is two `inferred` relations and draws solid,
 * while an `annotated` one-to-many draws dashed.
 */
export type RelationOrigin = 'inferred' | 'annotated' | 'implicit-many-to-many'

/** A field of a model as the drawing shows it. */
export type SchemaField = {
  readonly name: string
  readonly dbName?: string | null
  readonly kind: 'scalar' | 'object' | 'enum' | 'unsupported'
  readonly type: string
  readonly isList: boolean
  readonly isRequired: boolean
  readonly isId: boolean
  readonly isUnique?: boolean
  readonly isForeignKey: boolean
  readonly documentation: string | null
  readonly attributes?: readonly string[]
}

/** A model as the drawing shows it: a card with a row per field. */
export type SchemaModel = {
  readonly name: string
  readonly dbName: string | null
  readonly documentation?: string | null
  readonly primaryKey: readonly string[] | null
  readonly fields: readonly SchemaField[]
  readonly indexes?: readonly DiagramIndex[]
}

/** An enum as the drawing shows it: a card with a row per value. */
export type SchemaEnum = {
  readonly name: string
  readonly dbName: string | null
  readonly documentation?: string | null
  readonly values: readonly { readonly name: string; readonly dbName: string | null }[]
}

/** A relation as the drawing shows it: an edge from a field of one model to a field of another. */
export type SchemaRelation = {
  readonly origin: RelationOrigin
  readonly onDelete: string | null
  readonly onUpdate?: string | null
  readonly name?: string | null
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
}

/** A relation as Studio's canvas holds it: the drawing's own, and the id React Flow keys its edge by. */
type CanvasRelation = SchemaRelation & { readonly id: string }

/** The schema as Studio's canvas draws it. */
export type CanvasSchema = {
  readonly models: readonly SchemaModel[]
  readonly relations: readonly CanvasRelation[]
  readonly enums: readonly SchemaEnum[]
}

/** Everything a drawing is made from: the schema, where each block sits, and the theme. */
export type DiagramInput = {
  readonly models: readonly SchemaModel[]
  readonly relations: readonly SchemaRelation[]
  readonly enums?: readonly SchemaEnum[]
  readonly positions: LayoutPositions
  readonly theme?: DiagramTheme
}

/** What a card is told about the statement being drawn: whether it takes part, and which fields it reads. */
export type ModelHighlight = {
  readonly dim: boolean
  readonly used: ReadonlySet<string>
}

export type ModelNodeType = Node<
  {
    readonly model: SchemaModel
    readonly fields: readonly SchemaField[]
    readonly highlight: ModelHighlight | null
  },
  'model'
>

export type EnumNodeType = Node<{ readonly value: SchemaEnum }, 'enum'>

export type DiagramNodeType = ModelNodeType | EnumNodeType

export type RelationEdgeType = Edge<
  {
    /** The caption lines, as the exported diagram writes them; empty for an enum link. */
    readonly caption: readonly string[]
    readonly dimmed?: boolean
  },
  'relation'
>

/** The tables a statement touches, keyed by lowercased table name, each with the lowercased columns it reads. */
export type SchemaHighlight = ReadonlyMap<string, ReadonlySet<string>>
