defmodule Shop.Account do
  use Ecto.Schema
  @moduledoc """
  Someone who signs in. The key counts up in the database, the address is unique, and the
  timestamps have Prisma's own names on Rails' columns, so Ecto's `timestamps()` needs a source
  for each.
  """

  @primary_key {:id, :id, autogenerate: true}

  @type t :: %__MODULE__{
          id: integer(),
          email_address: String.t(),
          handle: String.t(),
          display_name: String.t() | nil,
          role: atom(),
          active: boolean(),
          profile: Shop.Profile.t() | nil,
          wishlist: Shop.Wishlist.t() | nil,
          orders: [Shop.Order.t()],
          gifts: [Shop.Order.t()],
          reviews: [Shop.Review.t()],
          audit_events: [Shop.AuditEvent.t()],
          followers: [Shop.Account.t()],
          following: [Shop.Account.t()]
        }

  schema "accounts" do
    field(:email_address, :string)
    field(:handle, :string)
    field(:display_name, :string)
    field(:role, Ecto.Enum, values: [CUSTOMER: "customer", STAFF: "staff", ADMIN: "ADMIN"], default: :CUSTOMER)
    field(:active, :boolean, default: true)
    has_one(:profile, Shop.Profile, foreign_key: :account_id)
    has_one(:wishlist, Shop.Wishlist, foreign_key: :account_id)
    has_many(:orders, Shop.Order, foreign_key: :account_id)
    has_many(:gifts, Shop.Order, foreign_key: :gift_for, references: :handle)
    has_many(:reviews, Shop.Review, foreign_key: :account_id)
    has_many(:audit_events, Shop.AuditEvent, foreign_key: :account_id)
    many_to_many(:followers, Shop.Account, join_through: "_Follows", join_keys: [A: :id, B: :id])
    many_to_many(:following, Shop.Account, join_through: "_Follows", join_keys: [B: :id, A: :id])
    timestamps(type: :utc_datetime, inserted_at_source: :created_at)
  end
end