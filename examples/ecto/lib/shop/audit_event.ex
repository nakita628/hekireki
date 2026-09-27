defmodule Shop.AuditEvent do
  use Ecto.Schema
  @moduledoc false

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