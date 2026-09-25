# The generated schemas in lib/shop against the real Ecto and ecto_sqlite3, on the SQLite
# database `prisma db push` made from schema.prisma. Everything the generator writes into a schema
# is used here, not only compiled: each type is written and read back, each default is on the
# struct, each key is made where Prisma makes it, each association is preloaded and each ON DELETE
# is left to the database. Each check raises with what it saw instead.
import Ecto.Query
import Ecto.Changeset

alias Shop.{
  Account,
  AuditEvent,
  Category,
  LineItem,
  Order,
  Product,
  Profile,
  Repo,
  Review,
  Tag,
  Wishlist
}

import Shop.Check

# From empty tables each time, so the check can be run again: the join tables first, then the
# tables in the order their foreign keys allow.
for table <-
      ~w(_ProductToTag _Wished _Follows line_items reviews orders audit_events profiles Wishlist
         Product Tag categories accounts keywords) do
  Repo.query!(~s(DELETE FROM "#{table}"))
end

# Category 1 is where a product goes when its category is removed (onDelete: SetDefault).
Repo.insert!(%Category{id: 1, name: "Uncategorised"})

account! = fn handle ->
  Repo.insert!(%Account{email_address: "#{handle}@example.com", handle: handle})
end

product! = fn sku, attrs ->
  Repo.insert!(
    struct(Product, Keyword.merge([sku: sku, name: sku, price: Decimal.new("1.00"), attributes: %{}], attrs))
  )
end

# --- The connection ----------------------------------------------------------------------------

check("foreign keys are enforced on the connection Ecto opens", fn ->
  expect(row("PRAGMA foreign_keys"), [[1]], "PRAGMA foreign_keys")
end)

# --- Types ------------------------------------------------------------------------------------

check("every scalar type SQLite has is written and read back as it was", fn ->
  released = ~U[2024-02-29 23:59:58Z]
  avatar = <<0, 255, 1, 0>>

  product =
    product!.("ROUND",
      price: Decimal.new("1234.56"),
      weight: 0.1,
      barcode: 9_007_199_254_740_993,
      stock: 2_147_483_647,
      attributes: %{"color" => "red", "sizes" => [1, 2.5, nil, true], "note" => "日本語 🍣"},
      label: "a\nb",
      released_at: released
    )

  account = account!.("types")
  Repo.insert!(%Profile{account_id: account.id, bio: "¯\\_(ツ)_/¯", avatar: avatar})

  found = Repo.get!(Product, product.id)
  profile = Repo.get_by!(Profile, account_id: account.id)

  reasons([
    if(Decimal.equal?(found.price, Decimal.new("1234.56")), do: nil, else: "price #{inspect(found.price)}"),
    expect(found.weight, 0.1, "Float"),
    expect(found.barcode, 9_007_199_254_740_993, "BigInt beyond 2^53"),
    expect(found.stock, 2_147_483_647, "Int"),
    expect(found.attributes, %{"color" => "red", "sizes" => [1, 2.5, nil, true], "note" => "日本語 🍣"}, "Json"),
    expect(found.label, "a\nb", "String"),
    expect(found.released_at, released, "DateTime"),
    expect(profile.avatar, avatar, "Bytes"),
    expect(profile.bio, "¯\\_(ツ)_/¯", "String with a backslash"),
    expect(Repo.get!(Account, account.id).active, true, "Boolean")
  ])
end)

# Prisma's Decimal is a DECIMAL column on SQLite, which has NUMERIC affinity: the database keeps a
# REAL, whatever Ecto sends. What a server keeps exactly, SQLite keeps to a double's precision.
check("SQLite keeps a Decimal as a REAL: 15 significant digits come back, 20 do not", fn ->
  fifteen = product!.("DEC15", price: Decimal.new("1234567890.12345"))
  twenty = product!.("DEC20", price: Decimal.new("1234567890.1234567891"))

  reasons([
    expect(row(~s[SELECT typeof(price) FROM "Product" WHERE id = ?], [fifteen.id]), [["real"]], "stored as"),
    expect(Decimal.equal?(Repo.get!(Product, fifteen.id).price, fifteen.price), true, "15 digits"),
    expect(Decimal.equal?(Repo.get!(Product, twenty.id).price, twenty.price), false, "20 digits")
  ])
end)

check("an optional field left out is nil, in the row and on the struct", fn ->
  product = product!.("OPTIONAL", [])
  found = Repo.get!(Product, product.id)

  reasons([
    expect({found.barcode, found.dimensions}, {nil, nil}, "struct"),
    expect(row(~s(SELECT barcode, dimensions FROM "Product" WHERE id = ?), [product.id]), [[nil, nil]], "row")
  ])
end)

# --- Defaults ---------------------------------------------------------------------------------

check("literal defaults are on a new struct before it is saved", fn ->
  product = %Product{}

  reasons([
    expect(product.weight, 0.0, "Float @default(0)"),
    expect(product.stock, -1, "Int @default(-1)"),
    expect(product.label, ~S(#{name} "quoted" \ back), "String default, not interpolated"),
    expect(product.released_at, ~U[2020-01-01 00:00:00Z], "DateTime literal"),
    expect(product.category_id, 1, "a foreign key's default"),
    expect(%Account{}.role, :CUSTOMER, "enum default"),
    expect(%Account{}.active, true, "Boolean default"),
    expect(%Order{}.status, :PENDING, "enum default"),
    expect(%LineItem{}.quantity, 1, "Int default on a composite-key row")
  ])
end)

check("a default the database fills with its clock is read back on insert", fn ->
  keyword = Repo.insert!(%Shop.Keyword{type: "clock"})
  event = Repo.insert!(%AuditEvent{action: "clock"})
  order = Repo.insert!(%Order{account_id: account!.("clock").id})

  reasons([
    if(match?(%DateTime{}, keyword.at), do: nil, else: "Keyword.at #{inspect(keyword.at)}"),
    if(match?(%DateTime{}, event.at), do: nil, else: "AuditEvent.at #{inspect(event.at)}"),
    if(match?(%DateTime{}, order.placed_at), do: nil, else: "Order.placed_at #{inspect(order.placed_at)}"),
    expect(Repo.get!(Shop.Keyword, keyword.id).at, keyword.at, "reloaded")
  ])
end)

# --- Keys -------------------------------------------------------------------------------------

check("keys are made where Prisma makes them", fn ->
  uuid = ~r/\A[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/
  account = account!.("keys")
  product = product!.("KEYS", [])
  wishlist = Repo.insert!(%Wishlist{account_id: account.id})
  event = Repo.insert!(%AuditEvent{action: "keys", account_id: account.id})
  order = Repo.insert!(%Order{account_id: account.id})

  reasons([
    if(is_integer(account.id), do: nil, else: "autoincrement id #{inspect(account.id)}"),
    if(product.id =~ uuid, do: nil, else: "uuid() key #{inspect(product.id)}"),
    if(wishlist.id =~ uuid, do: nil, else: "uuid() key #{inspect(wishlist.id)}"),
    if(wishlist.share_token =~ uuid, do: nil, else: "uuid() column #{inspect(wishlist.share_token)}"),
    if(is_integer(event.id), do: nil, else: "autoincrement id #{inspect(event.id)}"),
    expect(row("SELECT order_number FROM orders WHERE order_number = ?", [order.id]), [[order.id]], "@map-ped key")
  ])
end)

check("a cuid() key is Prisma's to make: Ecto has to be given one", fn ->
  refused =
    try do
      Repo.insert!(%Tag{name: "keyless"})
      "a Tag without an id was saved"
    rescue
      error in Exqlite.Error -> if error.message =~ "NOT NULL", do: nil, else: error.message
    end

  tag = Repo.insert!(%Tag{id: "c" <> Ecto.UUID.generate(), name: "keyed"})
  reasons([refused, expect(Repo.get!(Tag, tag.id).name, "keyed", "Tag by its given id")])
end)

# --- Names ------------------------------------------------------------------------------------

check("@@map and @map name the tables and columns, the schemas keep Elixir's names", fn ->
  account = Repo.insert!(%Account{email_address: "mapped@example.com", handle: "mapped", display_name: "M"})

  reasons([
    expect(Account.__schema__(:source), "accounts", "@@map"),
    expect(Product.__schema__(:source), "Product", "no @@map"),
    expect(Account.__schema__(:field_source, :email_address), :email_address, "@map equal to the field"),
    expect(Order.__schema__(:field_source, :id), :order_number, "@map-ped key"),
    expect(Shop.Keyword.__schema__(:field_source, :meta), :__meta__, "@map onto Ecto's own name"),
    expect(Product.__schema__(:field_source, :inserted_at), :createdAt, "timestamp source"),
    expect(
      row("SELECT email_address, display_name FROM accounts WHERE id = ?", [account.id]),
      [["mapped@example.com", "M"]],
      "row"
    )
  ])
end)

check("Elixir's words are plain columns: type, end, do, fn, when, schema, changeset, rescue, in", fn ->
  at = ~U[2025-01-01 00:00:00Z]

  attrs = [
    type: "t",
    end: at,
    do: "d",
    fn: "f",
    when: at,
    schema: "s",
    changeset: "c",
    meta: "m",
    rescue: true,
    in: 3
  ]

  keyword = Repo.insert!(struct(Shop.Keyword, attrs))
  found = Repo.get!(Shop.Keyword, keyword.id)
  cast = Shop.Keyword.changeset(%Shop.Keyword{}, Map.new(attrs))
  long = Shop.Keyword.changeset(%Shop.Keyword{}, %{type: "t", do: "dd"})

  reasons([
    expect(Map.take(found, Keyword.keys(attrs)), Map.new(attrs), "read back"),
    expect({cast.valid?, cast.changes}, {true, Map.new(attrs)}, "changeset/2 casts each"),
    expect(errors(long), %{do: ["should be at most 1 character(s)"]}, "validate_length(:do, ...)"),
    expect(
      row(~s(SELECT "__meta__", "end", "rescue" FROM keywords WHERE id = ?), [keyword.id]),
      [["m", "2025-01-01T00:00:00Z", 1]],
      "row"
    ),
    expect(Repo.one(from(k in Shop.Keyword, where: k.do == "d" and k.in == 3, select: k.fn)), "f", "query")
  ])
end)

check("a doc comment is the schema's @moduledoc, word for word", fn ->
  {:docs_v1, _, _, _, %{"en" => doc}, _, _} = Code.fetch_docs(Shop.Keyword)

  reasons([
    expect(
      String.contains?(doc, ~S(`#{interpolation}`, a `"""` and a backslash \ as a docstring)),
      true,
      "moduledoc #{inspect(doc)}"
    ),
    expect(String.contains?(doc, "@ecto"), false, "the @ecto line is not prose")
  ])
end)

# --- Enums ------------------------------------------------------------------------------------

check("an enum stores its @map value, loads it back as the member, and refuses others", fn ->
  staff = Repo.insert!(%Account{email_address: "staff@example.com", handle: "staff", role: :STAFF})
  admin = Repo.insert!(%Account{email_address: "admin@example.com", handle: "admin", role: :ADMIN})

  Repo.query!(
    "INSERT INTO accounts (email_address, handle, role, updated_at) VALUES ('raw@example.com', 'raw', 'customer', '2025-01-01T00:00:00Z')"
  )

  order = Repo.insert!(%Order{account_id: staff.id, status: :PAID})
  invalid = cast(%Account{}, %{role: "owner"}, [:role])

  reasons([
    expect(
      row("SELECT role FROM accounts WHERE id IN (?, ?) ORDER BY id", [staff.id, admin.id]),
      [["staff"], ["ADMIN"]],
      "stored"
    ),
    expect(Repo.get_by!(Account, handle: "raw").role, :CUSTOMER, "loaded from customer"),
    expect(row("SELECT status FROM orders WHERE order_number = ?", [order.id]), [["PAID"]], "unmapped enum"),
    expect(cast(%Account{}, %{role: "staff"}, [:role]).changes, %{role: :STAFF}, "cast from the database's value"),
    if(invalid.valid?, do: "cast took a value outside the enum", else: nil)
  ])
end)

# --- Constraints ------------------------------------------------------------------------------

check("changeset/2: what the schema requires, what the @ecto. lines ask and their messages", fn ->
  blank = Account.changeset(%Account{}, %{})
  wrong = Account.changeset(%Account{}, %{email_address: "no-at-sign", handle: String.duplicate("h", 21)})
  root = Account.changeset(%Account{}, %{email_address: "root@example.com", handle: "root"})
  unrated = Review.changeset(%Review{}, %{product_id: "p", account_id: 1})
  six = Review.changeset(%Review{}, %{product_id: "p", account_id: 1, rating: 6})

  given =
    Account.changeset(%Account{}, %{
      email_address: "given@example.com",
      handle: "given",
      role: "staff",
      created_at: "2000-01-01T00:00:00Z"
    })

  reasons([
    expect(errors(blank), %{email_address: ["can't be blank"], handle: ["can't be blank"]}, "required"),
    expect(
      errors(wrong),
      %{email_address: ["の形式が正しくありません"], handle: ["は20文字以内で入力してください"]},
      "format and length"
    ),
    expect(errors(root), %{handle: ["は使えません"]}, "the model's line"),
    expect(errors(unrated), %{rating: ["評価を入力してください"]}, "a required message of the field's own"),
    expect(errors(six), %{rating: ["must be less than or equal to 5"]}, "number"),
    expect(
      given.changes,
      %{email_address: "given@example.com", handle: "given", role: :STAFF},
      "cast takes the fields and the enum, not the timestamps"
    )
  ])
end)

check("a cast with empty values of its own keeps \"\" and blanks, and requires what is not nil", fn ->
  empty = Tag.changeset(%Tag{id: "c" <> Ecto.UUID.generate()}, %{name: ""})
  blank = Tag.changeset(%Tag{}, %{name: "  "})
  missing = Tag.changeset(%Tag{}, %{name: nil})
  saved = Repo.insert!(empty)

  reasons([
    expect({empty.valid?, empty.changes.name}, {true, ""}, "\"\" is a name"),
    expect({blank.valid?, blank.changes.name}, {true, "  "}, "a blank is kept"),
    expect(errors(missing), %{name: ["can't be blank"]}, "nil is missing"),
    expect(missing.required, [:name], "required, as validate_required marks it"),
    expect(Repo.get!(Tag, saved.id).name, "", "stored")
  ])
end)

check("@unique and @@unique turn a violation into a changeset error through changeset/2", fn ->
  account = account!.("unique")
  product = product!.("UNIQUE", [])
  Repo.insert!(%Review{product_id: product.id, account_id: account.id, rating: 5})

  {:error, again} =
    %Account{}
    |> Account.changeset(%{email_address: "unique@example.com", handle: "unique2"})
    |> Repo.insert()

  {:error, twice} =
    %Review{}
    |> Review.changeset(%{product_id: product.id, account_id: account.id, rating: 1})
    |> Repo.insert()

  reasons([
    expect(errors(again), %{email_address: ["は既に使われています"]}, "@unique, with its @ecto. message"),
    expect(Keyword.keys(twice.errors), [:product_id], "@@unique"),
    expect(Repo.aggregate(from(r in Review, where: r.product_id == ^product.id), :count), 1, "reviews")
  ])
end)

check("a composite primary key finds, loads its order, refuses a second row and deletes one", fn ->
  order = Repo.insert!(%Order{account_id: account!.("composite").id})
  product = product!.("COMPOSITE", [])

  item =
    Repo.insert!(%LineItem{order_number: order.id, product_id: product.id, unit_price: Decimal.new("9.99"), quantity: 2})

  found = Repo.get_by!(LineItem, order_number: order.id, product_id: product.id)

  {:error, duplicate} =
    %LineItem{}
    |> change(order_number: order.id, product_id: product.id, unit_price: Decimal.new("1"))
    |> unique_constraint([:order_number, :product_id], name: "line_items_order_number_product_id_index")
    |> Repo.insert()

  Repo.delete!(item)

  reasons([
    expect(LineItem.__schema__(:primary_key), [:order_number, :product_id], "primary key"),
    expect(Repo.preload(found, :order).order.id, order.id, "belongs_to an order by its order_number"),
    expect({found.quantity, Decimal.to_string(found.unit_price)}, {2, "9.99"}, "row"),
    if(duplicate.errors == [], do: "no error for a second row", else: nil),
    expect(Repo.get_by(LineItem, order_number: order.id, product_id: product.id), nil, "after delete")
  ])
end)

# --- Associations -----------------------------------------------------------------------------

check("a 1-1 is a has_one on the owner and a belongs_to on the row with the key", fn ->
  account = account!.("one")
  Repo.insert!(%Profile{account_id: account.id, bio: "hi"})
  Repo.insert!(%Wishlist{account_id: account.id})
  loaded = Repo.preload(Repo.get!(Account, account.id), [:profile, :wishlist])
  profile = Repo.preload(loaded.profile, :account)

  reasons([
    expect(loaded.profile.bio, "hi", "has_one"),
    expect(loaded.wishlist.account_id, account.id, "has_one to a uuid-keyed row"),
    expect(profile.account.handle, "one", "belongs_to")
  ])
end)

check("a 1-n is preloaded both ways, and two relations to one model stay apart", fn ->
  buyer = account!.("buyer")
  friend = account!.("friend")
  Repo.insert!(%Order{account_id: buyer.id, note: "own"})
  Repo.insert!(%Order{account_id: buyer.id, note: "gift", gift_for: friend.handle})

  buyer = Repo.preload(Repo.get!(Account, buyer.id), [:orders, :gifts])
  friend = Repo.preload(Repo.get!(Account, friend.id), [:orders, :gifts])
  gift = Repo.preload(Repo.get_by!(Order, note: "gift"), [:account, :gift_target])

  reasons([
    expect(buyer.orders |> Enum.map(& &1.note) |> Enum.sort(), ["gift", "own"], "has_many"),
    expect(buyer.gifts, [], "gifts of the buyer"),
    expect(Enum.map(friend.gifts, & &1.note), ["gift"], "has_many through references: :handle"),
    expect({gift.account.handle, gift.gift_target.handle}, {"buyer", "friend"}, "belongs_to both")
  ])
end)

check("a self relation is a tree: parent, children and replies preload", fn ->
  drinks = Repo.insert!(%Category{name: "Drinks"})
  tea = Repo.insert!(%Category{name: "Tea", parent_id: drinks.id})
  account = account!.("thread")
  product = product!.("THREAD", [])
  review = Repo.insert!(%Review{product_id: product.id, account_id: account.id, rating: 4})

  reply =
    Repo.insert!(%Review{product_id: product.id, account_id: account!.("replier").id, rating: 3, parent_id: review.id})

  reasons([
    expect(Repo.preload(drinks, :children).children |> Enum.map(& &1.name), ["Tea"], "children"),
    expect(Repo.preload(tea, :parent).parent.name, "Drinks", "parent"),
    expect(Repo.preload(review, :replies).replies |> Enum.map(& &1.id), [reply.id], "replies"),
    expect(Repo.preload(reply, :parent).parent.id, review.id, "reply's parent")
  ])
end)

check("an implicit many-to-many goes through Prisma's _ProductToTag, A the product, both ways", fn ->
  product = product!.("TAGGED", [])
  tag = Repo.insert!(%Tag{id: "tagged-id", name: "tagged"})

  product
  |> Repo.preload(:tags)
  |> change()
  |> put_assoc(:tags, [tag])
  |> Repo.update!()

  reasons([
    expect(row(~s(SELECT "A", "B" FROM "_ProductToTag")), [[product.id, tag.id]], "join row"),
    expect(Repo.preload(Repo.get!(Product, product.id), :tags).tags |> Enum.map(& &1.name), ["tagged"], "product.tags"),
    expect(Repo.preload(Repo.get!(Tag, tag.id), :products).products |> Enum.map(& &1.sku), ["TAGGED"], "tag.products")
  ])
end)

check("a named implicit many-to-many is _Wished, not _ProductToWishlist", fn ->
  product = product!.("WISHED", [])
  wishlist = Repo.insert!(%Wishlist{account_id: account!.("wisher").id})

  wishlist
  |> Repo.preload(:products)
  |> change()
  |> put_assoc(:products, [product])
  |> Repo.update!()

  reasons([
    expect(row(~s(SELECT "A", "B" FROM "_Wished")), [[product.id, wishlist.id]], "join row"),
    expect(Repo.preload(product, :wishlists).wishlists |> Enum.map(& &1.id), [wishlist.id], "product.wishlists")
  ])
end)

# Prisma Client, asked for alice.followers to connect bob, writes A = alice, B = bob: the field
# whose name sorts first ("followers") reads its own key from A.
check("a model related to itself many-to-many reads _Follows as Prisma writes it", fn ->
  alice = account!.("alice")
  bob = account!.("bob")

  alice
  |> Repo.preload(:followers)
  |> change()
  |> put_assoc(:followers, [bob])
  |> Repo.update!()

  reasons([
    expect(row(~s(SELECT "A", "B" FROM "_Follows")), [[alice.id, bob.id]], "join row"),
    expect(
      Repo.preload(Repo.get!(Account, alice.id), :followers).followers |> Enum.map(& &1.handle),
      ["bob"],
      "alice.followers"
    ),
    expect(
      Repo.preload(Repo.get!(Account, bob.id), :following).following |> Enum.map(& &1.handle),
      ["alice"],
      "bob.following"
    ),
    expect(Repo.preload(Repo.get!(Account, alice.id), :following).following, [], "alice.following")
  ])
end)

# --- ON DELETE --------------------------------------------------------------------------------

check("onDelete: Cascade takes the profile, wishlist, reviews and replies with their owner", fn ->
  account = account!.("cascade")
  product = product!.("CASCADE", [])
  Repo.insert!(%Profile{account_id: account.id})
  Repo.insert!(%Wishlist{account_id: account.id})
  review = Repo.insert!(%Review{product_id: product.id, account_id: account.id, rating: 1})

  reply =
    Repo.insert!(%Review{product_id: product.id, account_id: account!.("other").id, rating: 2, parent_id: review.id})

  Repo.delete!(account)

  reasons([
    expect(Repo.get_by(Profile, account_id: account.id), nil, "profile"),
    expect(Repo.get_by(Wishlist, account_id: account.id), nil, "wishlist"),
    expect(Repo.get(Review, review.id), nil, "review"),
    expect(Repo.get(Review, reply.id), nil, "reply of a removed review")
  ])
end)

check("onDelete: SetNull empties the key, through a referenced handle as well", fn ->
  account = account!.("setnull")
  parent = Repo.insert!(%Category{name: "Parent"})
  child = Repo.insert!(%Category{name: "Child", parent_id: parent.id})
  event = Repo.insert!(%AuditEvent{action: "setnull", account_id: account.id})
  gift = Repo.insert!(%Order{account_id: account!.("giver").id, gift_for: account.handle})
  Repo.delete!(parent)
  Repo.delete!(account)

  reasons([
    expect(Repo.get!(Category, child.id).parent_id, nil, "category parent"),
    expect(Repo.get!(AuditEvent, event.id).account_id, nil, "audit account"),
    expect(Repo.get!(Order, gift.id).gift_for, nil, "gift_for")
  ])
end)

check("onDelete: SetDefault moves a product back to category 1", fn ->
  category = Repo.insert!(%Category{name: "Seasonal"})
  product = product!.("SEASONAL", category_id: category.id)
  Repo.delete!(category)
  expect(Repo.get!(Product, product.id).category_id, 1, "category_id")
end)

# SQLite names no constraint when a foreign key refuses ("FOREIGN KEY constraint failed"), so
# foreign_key_constraint/3 has no name to match: the refusal is an Ecto.ConstraintError.
check("onDelete: Restrict and NoAction refuse to delete a row something still points at", fn ->
  account = account!.("restrict")
  order = Repo.insert!(%Order{account_id: account.id})

  Repo.insert!(%LineItem{order_number: order.id, product_id: product!.("RESTRICT", []).id, unit_price: Decimal.new("1")})

  refuse = fn struct ->
    try do
      Repo.delete!(struct)
      "#{inspect(struct.__struct__)} was deleted"
    rescue
      error in Ecto.ConstraintError -> if error.type == :foreign_key, do: nil, else: inspect(error)
    end
  end

  reasons([
    refuse.(order),
    refuse.(account),
    expect(Repo.get(Order, order.id) != nil and Repo.get(Account, account.id) != nil, true, "both still there")
  ])
end)

# --- Timestamps -------------------------------------------------------------------------------

check("timestamps are filled under Prisma's column names and bumped by an update", fn ->
  account = account!.("stamped")
  order = Repo.insert!(%Order{account_id: account.id})
  product = product!.("STAMPED", [])
  past = ~U[2000-01-01 00:00:00Z]
  Repo.query!("UPDATE accounts SET updated_at = ? WHERE id = ?", [past, account.id])
  Repo.query!("UPDATE orders SET changed_at = ? WHERE order_number = ?", [past, order.id])
  Repo.query!(~s(UPDATE "Product" SET "updatedAt" = ? WHERE id = ?), [past, product.id])

  account = Repo.update!(change(Repo.get!(Account, account.id), display_name: "Stamped"))
  order = Repo.update!(change(Repo.get!(Order, order.id), note: "changed"))
  product = Repo.update!(change(Repo.get!(Product, product.id), stock: 1))

  reasons([
    if(match?(%DateTime{}, account.inserted_at), do: nil, else: "accounts.created_at not filled"),
    if(DateTime.compare(account.updated_at, past) == :gt, do: nil, else: "accounts.updated_at not bumped"),
    if(DateTime.compare(order.updated_at, past) == :gt, do: nil, else: "orders.changed_at not bumped"),
    if(DateTime.compare(product.updated_at, past) == :gt, do: nil, else: ~s("Product"."updatedAt" not bumped)),
    expect(Map.has_key?(order, :inserted_at), false, "an order has no inserted_at"),
    expect(row("SELECT updated_at > '2000-01-02' FROM accounts WHERE id = ?", [account.id]), [[1]], "row")
  ])
end)
