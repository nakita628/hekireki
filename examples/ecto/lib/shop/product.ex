defmodule Shop.Product do
  use Ecto.Schema
  @moduledoc """
  A random primary key made by the client, not the database: Ecto has to generate it. Its
  author is an account with an integer key, the case where a module-wide
  `@foreign_key_type :binary_id` must not reach the `belongs_to`.
  """

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          sku: String.t(),
          name: String.t(),
          price: Decimal.t(),
          weight: float(),
          barcode: integer() | nil,
          stock: integer(),
          attributes: map(),
          dimensions: map() | nil,
          label: String.t(),
          released_at: DateTime.t(),
          category: Shop.Category.t() | nil,
          line_items: [Shop.LineItem.t()],
          reviews: [Shop.Review.t()],
          tags: [Shop.Tag.t()],
          wishlists: [Shop.Wishlist.t()]
        }

  schema "Product" do
    field(:sku, :string)
    field(:name, :string)
    field(:price, :decimal)
    field(:weight, :float, default: 0.0)
    field(:barcode, :integer)
    field(:stock, :integer, default: -1)
    field(:attributes, :map)
    field(:dimensions, :map)
    field(:label, :string, default: "\#{name} \"quoted\" \\ back")
    field(:released_at, :utc_datetime, default: ~U[2020-01-01 00:00:00Z])
    field(:category_id, :id, default: 1)
    belongs_to(:category, Shop.Category, foreign_key: :category_id, define_field: false, type: :id)
    has_many(:line_items, Shop.LineItem, foreign_key: :product_id)
    has_many(:reviews, Shop.Review, foreign_key: :product_id)
    many_to_many(:tags, Shop.Tag, join_through: "_ProductToTag", join_keys: [A: :id, B: :id])
    many_to_many(:wishlists, Shop.Wishlist, join_through: "_Wished", join_keys: [A: :id, B: :id])
    timestamps(type: :utc_datetime, inserted_at_source: :createdAt, updated_at_source: :updatedAt)
  end
end