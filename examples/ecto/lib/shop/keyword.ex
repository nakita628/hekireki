defmodule Shop.Keyword do
  use Ecto.Schema
  import Ecto.Changeset
  @moduledoc """
  Column names that are words of Elixir or names Ecto keeps for itself. Each is a plain column;
  Ecto takes any atom, but the generated code has to stay valid Elixir around it. The model's
  own name is Elixir's Keyword module, which Shop.Keyword leaves alone. The doc comment carries
  `\#{interpolation}`, a `\"""` and a backslash \\ as a docstring would have to. Its changeset casts
  and validates each of them by name.
  """

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
    field(:end, :utc_datetime)
    field(:do, :string)
    field(:fn, :string)
    field(:when, :utc_datetime)
    field(:schema, :string)
    field(:changeset, :string)
    field(:meta, :string, source: :__meta__)
    field(:rescue, :boolean)
    field(:in, :integer)
    field(:at, :utc_datetime, read_after_writes: true)
  end

  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(keyword, attrs) do
    keyword
    |> cast(attrs, [:type, :end, :do, :fn, :when, :schema, :changeset, :meta, :rescue, :in, :at])
    |> validate_required([:type])
    |> validate_length(:do, max: 1)
  end
end