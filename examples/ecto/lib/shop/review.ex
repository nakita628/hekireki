defmodule Shop.Review do
  use Ecto.Schema
  @moduledoc """
  One review per account per product (a composite unique). Replies point at the review they
  answer and go with it (a self relation that cascades).
  """

  @primary_key {:id, :id, autogenerate: true}

  @type t :: %__MODULE__{
          id: integer(),
          rating: integer(),
          body: String.t() | nil,
          product: Shop.Product.t() | nil,
          account: Shop.Account.t() | nil,
          parent: Shop.Review.t() | nil,
          replies: [Shop.Review.t()]
        }

  schema "reviews" do
    field(:rating, :integer)
    field(:body, :string)
    belongs_to(:product, Shop.Product, foreign_key: :product_id, type: :binary_id)
    belongs_to(:account, Shop.Account, foreign_key: :account_id)
    belongs_to(:parent, Shop.Review, foreign_key: :parent_id)
    has_many(:replies, Shop.Review, foreign_key: :parent_id)
  end
end