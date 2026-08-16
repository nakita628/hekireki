defmodule Example.Profile do
  use Ecto.Schema
  @moduledoc """
  One-to-one relation with native @db.* types, literal defaults,
  and optional scalars of every flavour. strictObject: the Pydantic
  model rejects unknown keys (extra="forbid").
  """

  @primary_key false

  @type t :: %__MODULE__{
          id: String.t(),
          bio: String.t() | nil,
          nickname: String.t(),
          age: integer() | nil,
          balance: Decimal.t(),
          verified: boolean(),
          meta: map() | nil,
          avatar: binary() | nil,
          last_seen: DateTime.t() | nil,
          user: Example.User.t() | nil
        }

  schema "profile" do
    field(:id, :string, primary_key: true)
    field(:bio, :string)
    field(:nickname, :string, default: "anonymous")
    field(:age, :integer)
    field(:balance, :decimal, default: Decimal.new("0"))
    field(:verified, :boolean, default: false)
    field(:meta, :map)
    field(:avatar, :binary)
    field(:last_seen, :utc_datetime)
    belongs_to(:user, Example.User, foreign_key: :user_id, type: :binary_id)
  end
end