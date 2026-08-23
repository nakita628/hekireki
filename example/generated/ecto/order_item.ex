defmodule Example.OrderItem do
  use Ecto.Schema
  @moduledoc """
  Child of Order with a composite unique constraint.
  """

  @primary_key false

  @type t :: %__MODULE__{
          id: integer(),
          sku: String.t(),
          qty: integer(),
          price: Decimal.t(),
          order: Example.Order.t() | nil
        }

  schema "order_items" do
    field(:id, :integer, primary_key: true)
    field(:sku, :string)
    field(:qty, :integer, default: 1)
    field(:price, :decimal)
    belongs_to(:order, Example.Order, foreign_key: :order_id)
  end
end