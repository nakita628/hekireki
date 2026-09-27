defmodule Shop.Category do
  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}

  @type t :: %__MODULE__{
          id: integer(),
          name: String.t(),
          parent: Shop.Category.t() | nil,
          children: [Shop.Category.t()],
          products: [Shop.Product.t()]
        }

  schema "categories" do
    field(:name, :string)
    belongs_to(:parent, Shop.Category, foreign_key: :parent_id)
    has_many(:children, Shop.Category, foreign_key: :parent_id)
    has_many(:products, Shop.Product, foreign_key: :category_id)
  end
end