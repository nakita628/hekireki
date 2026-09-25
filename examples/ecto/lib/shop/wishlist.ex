defmodule Shop.Wishlist do
  use Ecto.Schema
  @moduledoc """
  A saved list, one per account, holding products through a named implicit relation: the join
  table is `_Wished`, not `_ProductToWishlist`. Its key is a uuid and its owner's is an integer.
  """

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          share_token: String.t(),
          account: Shop.Account.t() | nil,
          products: [Shop.Product.t()]
        }

  schema "Wishlist" do
    field(:share_token, :string, autogenerate: {Ecto.UUID, :generate, []})
    belongs_to(:account, Shop.Account, foreign_key: :account_id, type: :id)
    many_to_many(:products, Shop.Product, join_through: "_Wished", join_keys: [B: :id, A: :id])
  end
end