defmodule Example.Category do
  @moduledoc """
  Self-relation (adjacency-list tree) with a composite unique.
  """

  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}

  @type t :: %__MODULE__{
          id: integer(),
          name: String.t(),
          parent: Example.Category.t() | nil,
          children: [Example.Category.t()]
        }

  schema "Category" do
    field(:name, :string)
    belongs_to(:parent, Example.Category, foreign_key: :parent_id)
    has_many(:children, Example.Category, foreign_key: :parent_id)
  end
end