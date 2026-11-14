defmodule Shop.Keyword do
  @moduledoc """
  Column names that are words of Elixir or names Ecto keeps for itself. Each is a plain column;
  Ecto takes any atom, but the generated code has to stay valid Elixir around it. The model's
  own name is Elixir's Keyword module, which Shop.Keyword leaves alone. The doc comment carries
  `\#{interpolation}`, a `\"""` and a backslash \\ as a docstring would have to. Its changeset casts
  and validates each of them by name.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :id, autogenerate: true}

  @type t :: %__MODULE__{
          id: integer(),
          type: String.t(),
          end: DateTime.t() | nil,
          do: String.t() | nil,
          fn: String.t() | nil,
          when: DateTime.t() | nil,
          schema: String.t() | nil,
          changeset: String.t() | nil,
          meta: String.t() | nil,
          rescue: boolean() | nil,
          in: integer() | nil,
          at: DateTime.t()
        }

  schema "keywords" do
    field(:type, :string)
    field(:end, Shop.PrismaDateTime)
    field(:do, :string)
    field(:fn, :string)
    field(:when, Shop.PrismaDateTime)
    # `schema` and `changeset` are what an Ecto module defines: a field may still have the name.
    field(:schema, :string)
    field(:changeset, :string)
    # Ecto keeps `__meta__` on every struct: the column may have the name, the field may not.
    field(:meta, :string, source: :__meta__)
    # Not `nil`: Prisma takes it, but ecto_sqlite3 reads a field named nil in an INSERT as a
    # cell left to its default and refuses the row.
    field(:rescue, :boolean)
    field(:in, :integer)
    # A now() that is not a timestamp: Prisma Client fills it with its own clock, and so does Ecto.
    field(:at, Shop.PrismaDateTime, autogenerate: true)
  end

  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(keyword, attrs) do
    keyword
    |> cast(attrs, [:type, :end, :do, :fn, :when, :schema, :changeset, :meta, :rescue, :in, :at])
    |> validate_required([:type])
    |> validate_length(:do, max: 1)
  end
end