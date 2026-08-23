defmodule Example.Category do
  use Ecto.Schema
  @moduledoc """
  Self-relation (adjacency-list tree) with a composite unique.
  """

  @primary_key {:id, :id, autogenerate: true}

  @type t :: %__MODULE__{
          id: integer(),
          name: String.t(),
          parent: Example.Category.t() | nil,
          children: [Example.Category.t()]
        }

  schema "category" do
    field(:name, :string)
    belongs_to(:parent, Example.Category, foreign_key: :parent_id)
    has_many(:children, Example.Category, foreign_key: :parent_id)
  end
end