defmodule Shop.Tag do
  use Ecto.Schema
  @moduledoc """
  The implicit many-to-many with Product: `_ProductToTag`, columns A (Product) and B (Tag). The
  key is a cuid, which Ecto has no generator for: the check gives it one.
  """

  @primary_key false

  @type t :: %__MODULE__{
          id: String.t(),
          name: String.t(),
          products: [Shop.Product.t()]
        }

  schema "Tag" do
    field(:id, :string, primary_key: true)
    field(:name, :string)
    many_to_many(:products, Shop.Product, join_through: "_ProductToTag", join_keys: [B: :id, A: :id])
  end
end