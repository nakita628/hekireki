defmodule Shop.Profile do
  @moduledoc """
  One per account, destroyed with it (1-1, the foreign key unique on this side).
  """

  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}

  @type t :: %__MODULE__{
          id: integer(),
          bio: String.t() | nil,
          avatar: binary() | nil,
          account: Shop.Account.t() | nil
        }

  schema "profiles" do
    field(:bio, :string)
    # Bytes: an avatar kept in the row, a BLOB in SQLite.
    field(:avatar, :binary)
    belongs_to(:account, Shop.Account, foreign_key: :account_id)
  end
end