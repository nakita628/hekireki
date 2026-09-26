defmodule Shop.Tag do
  use Ecto.Schema
  import Ecto.Changeset
  @moduledoc """
  The implicit many-to-many with Product: `_ProductToTag`, columns A (Product) and B (Tag). The
  key is a cuid, which Ecto has no generator for: the check gives it one. Its changeset keeps ""
  and blanks as they were sent, as the column does, and a name is missing only when it is nil.
  """

  @primary_key false

  @type t :: %__MODULE__{
          id: String.t(),
          name: String.t(),
          products: [Shop.Product.t()]
        }

  schema "Tag" do
    field(:id, :string, primary_key: true)
    field(:name, :string)
    many_to_many(:products, Shop.Product, join_through: "_ProductToTag", join_keys: [B: :id, A: :id])
  end

  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(tag, attrs) do
    tag
    |> cast(attrs, [:id, :name], empty_values: [])
    |> validate_not_null([:name])
    |> unique_constraint(:name)
  end

  # validate_required/3 for a column that takes "": missing is nil, and nothing else.
  defp validate_not_null(changeset, fields) do
    changeset = %{changeset | required: Enum.uniq(changeset.required ++ fields)}

    Enum.reduce(fields, changeset, fn field, acc ->
      if is_nil(get_field(acc, field)) and not Keyword.has_key?(acc.errors, field),
        do: add_error(acc, field, "can't be blank", validation: :required),
        else: acc
    end)
  end
end