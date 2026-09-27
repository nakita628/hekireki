defmodule Shop.Profile do
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
    field(:avatar, :binary)
    belongs_to(:account, Shop.Account, foreign_key: :account_id)
  end
end