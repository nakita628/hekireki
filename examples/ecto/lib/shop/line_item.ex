defmodule Shop.LineItem do
  @moduledoc """
  An explicit many-to-many between Order and Product, keyed by the pair.
  """

  use Ecto.Schema

  @primary_key false

  @type t :: %__MODULE__{
          order_number: integer(),
          product_id: String.t(),
          quantity: integer(),
          unit_price: Decimal.t(),
          order: Shop.Order.t() | nil,
          product: Shop.Product.t() | nil
        }

  schema "line_items" do
    field(:quantity, :integer, default: 1)
    field(:unit_price, :decimal)
    field(:order_number, :id, primary_key: true)
    field(:product_id, :string, primary_key: true)
    belongs_to(:order, Shop.Order, foreign_key: :order_number, define_field: false)
    belongs_to(:product, Shop.Product, foreign_key: :product_id, define_field: false, type: :string)
  end
end