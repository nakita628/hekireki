<?php

// The generated models in app/Models against the real Eloquent, on the SQLite database
// `prisma db push` made from schema.prisma. Everything the generator writes into a model is used
// here, not only loaded: each column is filled and read back, each cast answers with its type, each
// key is made where Prisma makes it, each relation is followed both ways and each ON DELETE is left
// to the database. Each check prints `ok: <name>`, or stops with what it saw.
declare(strict_types=1);

require __DIR__ . '/vendor/autoload.php';

use App\Models\Account;
use App\Models\Category;
use App\Models\Coupon;
use App\Models\Keyword;
use App\Models\LineItem;
use App\Models\Mood;
use App\Models\Order;
use App\Models\OrderStatus;
use App\Models\Product;
use App\Models\Profile;
use App\Models\Review;
use App\Models\Role;
use App\Models\Shipment;
use App\Models\Tag;
use App\Models\Wishlist;
use Carbon\CarbonInterface;
use Illuminate\Database\Capsule\Manager as Capsule;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;

$capsule = new Capsule();
$capsule->addConnection([
    'driver' => 'sqlite',
    'database' => __DIR__ . '/dev.db',
    'foreign_key_constraints' => true,
]);
$capsule->setAsGlobal();
$capsule->bootEloquent();
$db = $capsule->getConnection();

/** @param callable(): list<string|null> $body */
function check(string $name, callable $body): void
{
    $problems = array_values(array_filter($body(), fn (?string $p) => $p !== null));
    if ($problems !== []) {
        fwrite(STDERR, "{$name}: " . implode(', ', $problems) . "\n");
        exit(1);
    }
    echo "ok: {$name}\n";
}

function expect(mixed $got, mixed $want, string $label): ?string
{
    return $got === $want ? null : "{$label}: expected " . var_export($want, true) . ', got ' . var_export($got, true);
}

/** @return string|null what was thrown, by its class, or null when nothing was */
function thrown(callable $body): ?string
{
    try {
        $body();
    } catch (Throwable $e) {
        return $e::class;
    }
    return null;
}

// From empty tables each time, so the check can be run again: the join tables first, then the
// tables in the order their foreign keys allow.
foreach (['_ProductToTag', '_Wished', '_Follows', 'shipments', 'line_items', 'reviews', 'orders', 'profiles', 'Wishlist', 'Product', 'Tag', 'Coupon', 'categories', 'accounts', 'keywords'] as $table) {
    $db->statement("DELETE FROM \"{$table}\"");
}
// And the counters, so category 1 is the first one made below.
$db->statement('DELETE FROM sqlite_sequence');

$uncategorised = Category::create(['name' => 'Uncategorised']);
$account = fn (string $handle): Account => Account::create(['email_address' => "{$handle}@example.com", 'handle' => $handle]);
$product = fn (string $sku, array $extra = []): Product => Product::create([
    'sku' => $sku,
    'name' => $sku,
    'price' => '9.99',
    'attributes' => ['color' => 'red'],
    ...$extra,
]);

check('foreign keys are enforced on the connection Eloquent opens', fn () => [
    expect($db->selectOne('PRAGMA foreign_keys')->foreign_keys, 1, 'PRAGMA foreign_keys'),
    expect($uncategorised->id, 1, 'category 1, the default a product falls back to'),
]);

// --- Tables and columns ---------------------------------------------------------------------

check("every model names a table Prisma made, and every column of it", function () use ($db) {
    $problems = [];
    foreach (glob(__DIR__ . '/app/Models/*.php') as $file) {
        $class = 'App\\Models\\' . basename($file, '.php');
        if (!is_subclass_of($class, Model::class)) {
            continue;
        }
        $model = new $class();
        $columns = array_map(fn ($c) => $c->name, $db->select("PRAGMA table_info(\"{$model->getTable()}\")"));
        if ($columns === []) {
            $problems[] = "{$class}: no table {$model->getTable()}";
            continue;
        }
        $known = [
            ...$model->getFillable(),
            ...(is_string($model->getKeyName()) ? [$model->getKeyName()] : []),
            ...array_filter([$model->usesTimestamps() ? $model->getCreatedAtColumn() : null, $model->usesTimestamps() ? $model->getUpdatedAtColumn() : null]),
        ];
        $unknown = array_diff($known, $columns);
        $unsaid = array_diff($columns, $known);
        if ($unknown !== []) {
            $problems[] = "{$class} names columns the table has not: " . implode(', ', $unknown);
        }
        // A composite key's columns are fillable: they are what the caller gives.
        if ($unsaid !== []) {
            $problems[] = "{$class} says nothing of " . implode(', ', $unsaid);
        }
    }
    return $problems;
});

// --- Types ----------------------------------------------------------------------------------

check('every scalar type SQLite has is written and read back as it was', function () use ($account, $product) {
    $avatar = "\x00\xffPNG\n";
    $owner = $account('types');
    Profile::create(['account_id' => $owner->id, 'bio' => "two\nlines", 'avatar' => $avatar, 'mood' => Mood::FINE]);
    $made = $product('TYPES', [
        'price' => '12.34',
        'weight' => 1.5,
        'barcode' => 2 ** 53 + 1,
        'attributes' => ['nested' => ['list' => [1, 'two', null]], 'flag' => true],
        'released_at' => '2021-02-03 04:05:06',
    ]);
    $found = Product::findOrFail($made->id);
    $profile = Profile::where('account_id', $owner->id)->firstOrFail();

    return [
        expect((string) $found->price, '12.34', 'Decimal'),
        expect($found->weight, 1.5, 'Float'),
        expect($found->barcode, 2 ** 53 + 1, 'BigInt beyond 2^53'),
        expect($found->attributes, ['nested' => ['list' => [1, 'two', null]], 'flag' => true], 'Json, in a column named attributes'),
        expect($found->dimensions, null, 'optional Json'),
        expect($found->released_at instanceof CarbonInterface ? $found->released_at->format('Y-m-d H:i:s') : $found->released_at, '2021-02-03 04:05:06', 'DateTime'),
        expect(Account::findOrFail($owner->id)->active, true, 'Boolean'),
        expect($profile->avatar, $avatar, 'Bytes with a zero byte'),
        expect($profile->bio, "two\nlines", 'String with a newline'),
    ];
});

check('an optional field left out is null, in the row and on the model', function () use ($db, $account) {
    $made = $account('optional');
    $found = Account::findOrFail($made->id);
    return [
        expect($found->display_name, null, 'display_name'),
        expect($db->selectOne('SELECT display_name FROM accounts WHERE id = ?', [$made->id])->display_name, null, 'row'),
    ];
});

check('literal defaults are on a new model before it is saved', function () {
    $new = new Product();
    $account = new Account();
    $order = new Order();
    return [
        expect($new->weight, 0.0, 'a Float the schema writes as 0'),
        expect($new->stock, -1, 'a negative Int'),
        expect($new->label, 'it\'s "quoted" \\ back', 'a String with quotes and a backslash'),
        expect($new->released_at instanceof CarbonInterface ? $new->released_at->format('Y-m-d H:i:s') : $new->released_at, '2020-01-01 00:00:00', 'a DateTime literal'),
        expect($new->category_id, 1, 'a foreign key'),
        expect($account->role, Role::CUSTOMER, 'an enum member'),
        expect($account->active, true, 'a Boolean'),
        expect($order->status, OrderStatus::PENDING, 'an enum with no @map'),
    ];
});

check('a default the database fills from its clock is there once the row is read again', function () use ($account) {
    $order = Order::create(['account_id' => $account('clock')->id]);
    return [
        expect($order->fresh()->placed_at instanceof CarbonInterface, true, 'placed_at'),
    ];
});

// --- Keys -----------------------------------------------------------------------------------

check('keys are made where Prisma makes them', function () use ($account, $product) {
    $first = $account('key1');
    $second = $account('key2');
    $made = $product('KEYS');
    $tag = Tag::create(['name' => 'keys']);
    $wishlist = Wishlist::create(['account_id' => $first->id]);
    $order = Order::create(['account_id' => $first->id]);
    return [
        expect($second->id, $first->id + 1, 'autoincrement counts up'),
        expect((bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', (string) $made->id), true, "uuid(), a version 4 UUID Eloquent made: {$made->id}"),
        // Crockford's base 32, which leaves out I, L, O and U. cspell:ignore HJKMNP
        expect((bool) preg_match('/^[0-9A-HJKMNP-TV-Z]{26}$/', (string) $tag->id), true, "ulid(), a ULID Eloquent made, in upper case as Prisma Client makes it: {$tag->id}"),
        expect(Wishlist::findOrFail($wishlist->id)->account_id, $first->id, 'a uuid-keyed row found by its key'),
        expect($order->order_number, Order::max('order_number'), 'a key named order_number, read back after insert'),
        expect(Order::findOrFail($order->order_number)->account_id, $first->id, 'found by it'),
    ];
});

check("a cuid() key is Prisma's to make: Eloquent has to be given one", function () {
    $given = Coupon::create(['id' => 'c' . bin2hex(random_bytes(12)), 'code' => 'GIVEN']);
    return [
        expect(thrown(fn () => Coupon::create(['code' => 'KEYLESS'])), QueryException::class, 'a coupon with no key'),
        expect(Coupon::where('code', 'GIVEN')->value('id'), $given->id, 'the key given, mass-assigned'),
    ];
});

check('@@map and @map name the tables and columns, and the models read them by those names', function () use ($db, $account) {
    $made = $account('names');
    $made->update(['display_name' => 'Named']);
    return [
        expect((new Account())->getTable(), 'accounts', '@@map'),
        expect((new Product())->getTable(), 'Product', 'no @@map'),
        expect($db->selectOne('SELECT display_name FROM accounts WHERE id = ?', [$made->id])->display_name, 'Named', '@map column'),
        expect(Account::where('email_address', 'names@example.com')->value('handle'), 'names', 'queried by column'),
    ];
});

check("PHP's words are plain columns: type, class, function, match, list, static", function () {
    $attributes = ['type' => 't', 'class' => 'c', 'function' => 'f', 'match' => 'm', 'list' => 'l', 'static' => true];
    $made = Keyword::create($attributes);
    $found = Keyword::findOrFail($made->id);
    return [
        expect(array_intersect_key($found->toArray(), $attributes), $attributes, 'read back'),
        expect(Keyword::where('match', 'm')->value('class'), 'c', 'query'),
    ];
});

check("a doc comment is the class's docblock, a */ in it written *\\/ so the block goes on", fn () => [
    expect(str_contains((string) (new ReflectionClass(Keyword::class))->getDocComment(), 'early: *\\/ and a'), true, 'docblock'),
]);

// --- Enums ----------------------------------------------------------------------------------

check('an enum stores its @map value, loads it back as the case, and refuses others', function () use ($db, $account) {
    $staff = Account::create(['email_address' => 's@example.com', 'handle' => 'staff', 'role' => Role::STAFF]);
    $admin = Account::create(['email_address' => 'a@example.com', 'handle' => 'admin', 'role' => Role::ADMIN]);
    $db->insert("INSERT INTO accounts (email_address, handle, role, updated_at) VALUES ('raw@example.com', 'raw', 'customer', '2025-01-01 00:00:00')");
    $owner = $account('moody');
    Profile::create(['account_id' => $owner->id, 'mood' => Mood::FINE]);
    $order = Order::create(['account_id' => $staff->id, 'status' => OrderStatus::PAID]);
    return [
        expect(array_map(fn ($r) => $r->role, $db->select('SELECT role FROM accounts WHERE id IN (?, ?) ORDER BY id', [$staff->id, $admin->id])), ['staff', 'ADMIN'], 'stored'),
        expect(Account::where('handle', 'raw')->firstOrFail()->role, Role::CUSTOMER, 'loaded from customer'),
        expect($db->selectOne('SELECT mood FROM profiles WHERE account_id = ?', [$owner->id])->mood, "it's fine", 'a value with an apostrophe'),
        expect(Mood::ESCAPED->value, 'back\\slash', 'a value with a backslash'),
        expect(Order::findOrFail($order->order_number)->status, OrderStatus::PAID, 'unmapped enum'),
        expect(thrown(fn () => new Account(['role' => 'owner'])), ValueError::class, 'a value outside the enum'),
    ];
});

// --- Constraints ----------------------------------------------------------------------------

check('@unique and @@unique refuse a second row', function () use ($account, $product) {
    $owner = $account('unique');
    $made = $product('UNIQUE');
    Review::create(['product_id' => $made->id, 'account_id' => $owner->id, 'rating' => 5]);
    return [
        expect(thrown(fn () => $account('unique')), UniqueConstraintViolationException::class, '@unique'),
        expect(thrown(fn () => Review::create(['product_id' => $made->id, 'account_id' => $owner->id, 'rating' => 1])), UniqueConstraintViolationException::class, '@@unique'),
    ];
});

check('a composite primary key finds, updates and deletes one row, and refuses a second', function () use ($account, $product) {
    $order = Order::create(['account_id' => $account('composite')->id]);
    $one = $product('COMPOSITE1');
    $two = $product('COMPOSITE2');
    LineItem::create(['order_number' => $order->order_number, 'product_id' => $one->id, 'unit_price' => '1.00']);
    LineItem::create(['order_number' => $order->order_number, 'product_id' => $two->id, 'unit_price' => '2.00']);
    $item = LineItem::where(['order_number' => $order->order_number, 'product_id' => $one->id])->firstOrFail();
    $item->update(['quantity' => 3]);
    $item->delete();
    return [
        expect(thrown(fn () => LineItem::create(['order_number' => $order->order_number, 'product_id' => $two->id, 'unit_price' => '3.00'])), UniqueConstraintViolationException::class, 'a second row'),
        expect(LineItem::where('order_number', $order->order_number)->pluck('quantity', 'product_id')->all(), [$two->id => 1], 'one row left, the other untouched'),
        expect($order->lineItems()->count(), 1, 'hasMany on a key named order_number'),
    ];
});

// --- Relations ------------------------------------------------------------------------------

check('a 1-1 is a hasOne on the owner and a belongsTo on the row with the key', function () use ($account) {
    $owner = $account('one');
    $owner->profile()->create(['bio' => 'mine']);
    return [
        expect($owner->profile->bio, 'mine', 'hasOne'),
        expect(Profile::where('bio', 'mine')->firstOrFail()->account->handle, 'one', 'belongsTo'),
    ];
});

check('a 1-n both ways, two relations to one model kept apart, and one on a key that is not the primary', function () use ($account) {
    $buyer = $account('buyer');
    $friend = $account('friend');
    $buyer->orders()->create(['gift_for' => 'friend']);
    $buyer->orders()->create([]);
    return [
        expect($buyer->orders()->count(), 2, 'hasMany'),
        expect($friend->gifts()->count(), 1, 'hasMany by handle'),
        expect($friend->orders()->count(), 0, 'the other relation'),
        expect(Order::where('gift_for', 'friend')->firstOrFail()->giftTarget->id, $friend->id, 'belongsTo by handle'),
    ];
});

check('a self relation is a tree: parent and children, a review and its replies', function () use ($account, $product) {
    $root = Category::create(['name' => 'Root']);
    $leaf = $root->children()->create(['name' => 'Leaf']);
    $owner = $account('thread');
    $review = Review::create(['product_id' => $product('THREAD')->id, 'account_id' => $owner->id, 'rating' => 4]);
    $reply = $review->replies()->create(['product_id' => $review->product_id, 'account_id' => $account('replier')->id, 'rating' => 3]);
    return [
        expect($leaf->parent_id, $root->id, 'the child points at its parent'),
        expect($root->children()->pluck('name')->all(), ['Leaf'], 'children'),
        expect($leaf->parent->name, 'Root', 'parent'),
        expect($reply->parent->id, $review->id, 'a reply answers its review'),
    ];
});

check("an implicit many-to-many goes through Prisma's _ProductToTag, A the product, both ways", function () use ($db, $product) {
    $made = $product('TAGGED');
    $tag = Tag::create(['name' => 'tagged']);
    $made->tags()->attach($tag->id);
    return [
        expect(array_map(fn ($r) => (array) $r, $db->select('SELECT "A", "B" FROM "_ProductToTag"')), [['A' => $made->id, 'B' => $tag->id]], 'the row'),
        expect($made->tags()->pluck('name')->all(), ['tagged'], 'product to tags'),
        expect($tag->products()->pluck('sku')->all(), ['TAGGED'], 'tag to products'),
    ];
});

check('a named implicit many-to-many is _Wished, not _ProductToWishlist', function () use ($db, $account, $product) {
    $made = $product('WISHED');
    $wishlist = Wishlist::create(['account_id' => $account('wisher')->id]);
    $wishlist->products()->attach($made->id);
    return [
        expect(array_map(fn ($r) => (array) $r, $db->select('SELECT "A", "B" FROM "_Wished"')), [['A' => $made->id, 'B' => $wishlist->id]], 'the row'),
        expect($made->wishlists()->count(), 1, 'product to wishlists'),
    ];
});

check('a model related to itself many-to-many reads _Follows as Prisma writes it', function () use ($db, $account) {
    $alice = $account('alice');
    $bob = $account('bob');
    // What Prisma Client writes for `bob.following.connect(alice)`: of the two fields, `followers`
    // sorts first, so its model's key is A: A is followed (alice), B is the follower (bob).
    $db->insert('INSERT INTO "_Follows" ("A", "B") VALUES (?, ?)', [$alice->id, $bob->id]);
    return [
        expect($alice->followers()->pluck('handle')->all(), ['bob'], "alice's followers"),
        expect($bob->following()->pluck('handle')->all(), ['alice'], 'who bob follows'),
        expect($alice->following()->count(), 0, 'alice follows no one'),
    ];
});

check('a key of several columns has no relation method, and its columns are plain', function () use ($account, $product) {
    $order = Order::create(['account_id' => $account('shipper')->id]);
    $made = $product('SHIPPED');
    LineItem::create(['order_number' => $order->order_number, 'product_id' => $made->id, 'unit_price' => '1.00']);
    $shipment = Shipment::create(['order_number' => $order->order_number, 'product_id' => $made->id, 'carrier' => 'post']);
    return [
        expect(method_exists(Shipment::class, 'lineItem'), false, 'no half-join'),
        expect(Shipment::findOrFail($shipment->id)->carrier, 'post', 'read back'),
    ];
});

// --- ON DELETE ------------------------------------------------------------------------------

check('onDelete: Cascade takes the profile, wishlist, reviews and replies with their owner', function () use ($account, $product) {
    $owner = $account('cascade');
    $owner->profile()->create([]);
    Wishlist::create(['account_id' => $owner->id]);
    $review = Review::create(['product_id' => $product('CASCADE')->id, 'account_id' => $owner->id, 'rating' => 5]);
    $reply = $review->replies()->create(['product_id' => $review->product_id, 'account_id' => $account('other')->id, 'rating' => 1]);
    $owner->delete();
    return [
        expect(Profile::where('account_id', $owner->id)->exists(), false, 'profile'),
        expect(Wishlist::where('account_id', $owner->id)->exists(), false, 'wishlist'),
        expect(Review::whereKey([$review->id, $reply->id])->exists(), false, 'review and its reply'),
    ];
});

check('onDelete: SetNull empties the key, through a referenced handle as well', function () use ($account) {
    $root = Category::create(['name' => 'Gone']);
    $leaf = Category::create(['name' => 'Stays', 'parent_id' => $root->id]);
    $friend = $account('recipient');
    $order = Order::create(['account_id' => $account('giver')->id, 'gift_for' => 'recipient']);
    $root->delete();
    $friend->delete();
    return [
        expect($leaf->fresh()->parent_id, null, 'a child of a deleted parent'),
        expect($order->fresh()->gift_for, null, 'a gift to a deleted account'),
    ];
});

check('onDelete: SetDefault moves a product back to category 1', function () use ($product) {
    $category = Category::create(['name' => 'Seasonal']);
    $made = $product('SEASONAL', ['category_id' => $category->id]);
    $category->delete();
    return [expect($made->fresh()->category_id, 1, 'category_id')];
});

check('onDelete: Restrict and NoAction refuse to delete a row something still points at', function () use ($account, $product) {
    $owner = $account('restrict');
    $order = Order::create(['account_id' => $owner->id]);
    LineItem::create(['order_number' => $order->order_number, 'product_id' => $product('RESTRICT')->id, 'unit_price' => '1.00']);
    return [
        expect(thrown(fn () => $order->delete()), QueryException::class, 'Restrict: an order with line items'),
        expect(thrown(fn () => $owner->delete()), QueryException::class, 'NoAction: an account with orders'),
        expect(Order::whereKey($order->order_number)->exists(), true, 'the order stays'),
    ];
});

// --- Timestamps -----------------------------------------------------------------------------

check("timestamps are filled under Prisma's column names and bumped by an update", function () use ($db, $account, $product) {
    $past = '2000-01-01 00:00:00';
    $owner = $account('stamped');
    $order = Order::create(['account_id' => $owner->id]);
    $made = $product('STAMPED');
    $db->update('UPDATE accounts SET updated_at = ? WHERE id = ?', [$past, $owner->id]);
    $db->update('UPDATE orders SET changed_at = ? WHERE order_number = ?', [$past, $order->order_number]);
    $db->update('UPDATE "Product" SET "updatedAt" = ? WHERE id = ?', [$past, $made->id]);
    $owner->fresh()->update(['display_name' => 'Stamped']);
    $order->fresh()->update(['note' => 'changed']);
    $made->fresh()->update(['stock' => 1]);
    return [
        expect($owner->created_at instanceof CarbonInterface, true, 'accounts.created_at filled'),
        expect($made->createdAt instanceof CarbonInterface, true, 'Product.createdAt filled'),
        expect($owner->fresh()->updated_at->greaterThan($past), true, 'accounts.updated_at bumped'),
        expect($order->fresh()->changed_at->greaterThan($past), true, 'orders.changed_at bumped'),
        expect($made->fresh()->updatedAt->greaterThan($past), true, 'Product.updatedAt bumped'),
        expect(Order::CREATED_AT, null, 'an order has no created-at'),
        expect((new Profile())->usesTimestamps(), false, 'a profile has none'),
    ];
});
