defmodule Shop.AuditEvent do
  use Ecto.Schema
  @moduledoc """
  An append-only log, and an account that may go before its events do. The key would be a
  BigInt on a server; on SQLite, `prisma db push` makes a BigInt autoincrement key a plain
  BIGINT column that nothing counts up, so it is an Int here.
  """

  @primary_key {:id, :id, autogenerate: true}

  @type t :: %__MODULE__{
          id: integer(),
          action: String.t(),
          payload: map() | nil,
          at: DateTime.t(),
          account: Shop.Account.t() | nil
        }

  schema "audit_events" do
    field(:action, :string)
    field(:payload, :map)
    field(:at, Shop.PrismaDateTime, autogenerate: true)
    belongs_to(:account, Shop.Account, foreign_key: :account_id)
  end
end