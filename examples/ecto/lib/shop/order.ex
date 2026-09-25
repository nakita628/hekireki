defmodule Shop.Order do
  use Ecto.Schema
  @moduledoc """
  The primary key is not called `id` and has a column of its own: Ecto calls it `:id` with a
  `source:`. An order cannot be removed while it has line items (Restrict), and its account
  cannot be removed while it has orders (NoAction, which SQLite checks at the end of the
  statement).
  """

  @primary_key {:id, :id, autogenerate: true, source: :order_number}
  @timestamps_opts [type: Shop.PrismaDateTime, autogenerate: {Shop.PrismaDateTime, :autogenerate, []}]

  @type t :: %__MODULE__{
          id: integer(),
          status: atom(),
          note: String.t() | nil,
          placed_at: DateTime.t(),
          updated_at: DateTime.t(),
          synced_at: DateTime.t(),
          account: Shop.Account.t() | nil,
          gift_target: Shop.Account.t() | nil,
          line_items: [Shop.LineItem.t()]
        }

  schema "orders" do
    field(:status, Ecto.Enum, values: [:PENDING, :PAID, :SHIPPED, :CANCELLED], default: :PENDING)
    field(:note, :string)
    field(:placed_at, Shop.PrismaDateTime, autogenerate: true)
    belongs_to(:account, Shop.Account, foreign_key: :account_id)
    belongs_to(:gift_target, Shop.Account, foreign_key: :gift_for, type: :string, references: :handle)
    has_many(:line_items, Shop.LineItem, foreign_key: :order_number)
    timestamps(inserted_at: false, updated_at_source: :changed_at)
    timestamps(inserted_at: false, updated_at: :synced_at)
  end
end