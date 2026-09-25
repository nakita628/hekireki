defmodule Shop.Review do
  use Ecto.Schema
  import Ecto.Changeset
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

  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(review, attrs) do
    review
    |> cast(attrs, [:product_id, :account_id, :rating, :body, :parent_id])
    |> validate_required([:product_id, :account_id])
    |> validate_required([:rating], message: "評価を入力してください")
    |> validate_number(:rating, greater_than_or_equal_to: 1, less_than_or_equal_to: 5)
    |> unique_constraint([:product_id, :account_id])
  end
end