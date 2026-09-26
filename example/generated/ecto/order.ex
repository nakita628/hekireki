defmodule Example.Order do
  use Ecto.Schema
  @moduledoc """
  BigInt autoincrement primary key (bigserial) and money as Decimal.
  """

  @primary_key {:id, :id, autogenerate: true}

  @type t :: %__MODULE__{
          id: integer(),
          total: Decimal.t(),
          placed_at: DateTime.t(),
          user: Example.User.t() | nil,
          items: [Example.OrderItem.t()]
        }

  schema "orders" do
    field(:total, :decimal)
    field(:placed_at, Example.PrismaDateTime, autogenerate: true)
    belongs_to(:user, Example.User, foreign_key: :user_id, type: :binary_id)
    has_many(:items, Example.OrderItem, foreign_key: :order_id)
  end
end