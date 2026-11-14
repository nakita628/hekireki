defmodule Shop.Product do
  @moduledoc """
  A random primary key made by the client, not the database: Ecto has to generate it. Its
  author is an account with an integer key, the case where a module-wide
  `@foreign_key_type :binary_id` must not reach the `belongs_to`.
  """

  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  @timestamps_opts [type: Shop.PrismaDateTime, autogenerate: {Shop.PrismaDateTime, :autogenerate, []}]

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
          inserted_at: DateTime.t(),
          updated_at: DateTime.t(),
          category: Shop.Category.t() | nil,
          line_items: [Shop.LineItem.t()],
          reviews: [Shop.Review.t()],
          tags: [Shop.Tag.t()],
          wishlists: [Shop.Wishlist.t()]
        }

  schema "Product" do
    field(:sku, :string)
    field(:name, :string)
    # Money is Decimal, never Float.
    field(:price, :decimal)
    # A Float default the schema writes as an integer: Ecto wants `0.0`.
    field(:weight, :float, default: 0.0)
    # Beyond 2^53: BigInt, which JavaScript cannot hold in a Number.
    field(:barcode, :integer)
    field(:stock, :integer, default: -1)
    # Json, a JSONB column in SQLite. No default: `prisma db push` writes a Json default on SQLite
    # unquoted, and SQLite refuses the table.
    field(:attributes, :map)
    field(:dimensions, :map)
    # A string default Elixir would interpolate if it were not escaped.
    field(:label, :string, default: "\#{name} \"quoted\" \\ back")
    # A DateTime literal written with an offset: the instant is 2020-01-01T00:00:00Z.
    field(:released_at, Shop.PrismaDateTime, default: ~U[2020-01-01 00:00:00.000Z])
    # Category 1 is "Uncategorised": a product whose category is removed goes back to it.
    field(:category_id, :id, default: 1)
    belongs_to(:category, Shop.Category, foreign_key: :category_id, define_field: false, type: :id)
    has_many(:line_items, Shop.LineItem, foreign_key: :product_id)
    has_many(:reviews, Shop.Review, foreign_key: :product_id)
    many_to_many(:tags, Shop.Tag, join_through: "_ProductToTag", join_keys: [A: :id, B: :id])
    many_to_many(:wishlists, Shop.Wishlist, join_through: "_Wished", join_keys: [A: :id, B: :id])
    timestamps(inserted_at_source: :createdAt, updated_at_source: :updatedAt)
  end
end