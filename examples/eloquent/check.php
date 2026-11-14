<?php

// The generated models against the real Eloquent, on the database `prisma db push` made from
// schema.prisma: dev.db, or with ELOQUENT_DATABASE the PostgreSQL or MySQL one provider.ts made
// (see bootstrap.php). Everything the generator writes into a model is used here, not only
// loaded: each column is filled and read back, each cast answers with its type, each key is made
// where Prisma makes it, each relation is followed both ways and each ON DELETE is left to the
// database. Nothing here is written for one database: tables and rows go through the query
// builder, and a time is compared as the instant it names.
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

use App\Models\Account;
use App\Models\Category;
use App\Models\Coupon;
use App\Models\ExchangeRate;
use App\Models\Keyword;
use App\Models\Kind;
use App\Models\LineItem;
use App\Models\Mood;
use App\Models\Order;
use App\Models\OrderStatus;
use App\Models\Product;
use App\Models\Profile;
use App\Models\Review;
use App\Models\Role;
use App\Models\Shipment;
use App\Models\Slot;
use App\Models\StoreSetting;
use App\Models\Tag;
use App\Models\Wishlist;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;

// From empty tables each time, so the check can be run again, and with the counters back at the
// start, so category 1 is the first one made below.
$db->getSchemaBuilder()->withoutForeignKeyConstraints(function () use ($db) {
    foreach (['_ProductToTag', '_Wished', '_Follows', 'shipments', 'line_items', 'reviews', 'orders', 'profiles', 'Wishlist', 'Product', 'Tag', 'Coupon', 'categories', 'accounts', 'keywords', 'store_setting', 'exchange_rates'] as $table) {
        $db->table($table)->truncate();
    }
});

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
    expect(thrown(fn () => Profile::create(['account_id' => 999999])), QueryException::class, 'a profile of no account'),
    expect($uncategorised->id, 1, 'category 1, the default a product falls back to'),
]);

// --- Tables and columns ---------------------------------------------------------------------

check('every model names a table Prisma made, and every column of it', function () use ($db, $models) {
    $problems = [];
    foreach (glob("{$models}/*.php") as $file) {
        $class = 'App\\Models\\' . basename($file, '.php');
        if (! is_subclass_of($class, Model::class)) {
            continue;
        }
        $model = new $class();
        $columns = $db->getSchemaBuilder()->getColumnListing($model->getTable());
        if ($columns === []) {
            $problems[] = "{$class}: no table {$model->getTable()}";
            continue;
        }
        // A composite key's columns are fillable: they are what the caller gives.
        $known = [
            ...$model->getFillable(),
            ...(is_string($model->getKeyName()) ? [$model->getKeyName()] : []),
            ...array_filter([$model->usesTimestamps() ? $model->getCreatedAtColumn() : null, $model->usesTimestamps() ? $model->getUpdatedAtColumn() : null]),
        ];
        if (($unknown = array_diff($known, $columns)) !== []) {
            $problems[] = "{$class} names columns the table has not: " . implode(', ', $unknown);
        }
        if (($unsaid = array_diff($columns, $known)) !== []) {
            $problems[] = "{$class} says nothing of " . implode(', ', $unsaid);
        }
    }
    return $problems;
});

// --- Types ----------------------------------------------------------------------------------

check('every scalar type is written and read back as it was', function () use ($db, $driver, $account, $product) {
    $avatar = "\x00\xffPNG\n";
    $json = ['nested' => ['list' => [1, 'two', null]], 'flag' => true];
    $owner = $account('types');
    Profile::create(['account_id' => $owner->id, 'bio' => "two\nlines", 'avatar' => $avatar, 'mood' => Mood::FINE]);
    $made = $product('TYPES', [
        'price' => '12.34',
        'weight' => 1.5,
        'barcode' => 2 ** 53 + 1,
        'attributes' => $json,
        'released_at' => '2021-02-03T04:05:06.789Z',
    ]);
    $found = Product::findOrFail($made->id);
    $profile = Profile::where('account_id', $owner->id)->firstOrFail();

    return [
        // SQLite hands a Decimal back as a float, PostgreSQL and MySQL padded to scale 30.
        expect($found->price, '12.34', 'Decimal, the string Prisma prints'),
        expect(ExchangeRate::create(['base' => 'X', 'quote' => 'Y', 'rate' => '10.00'])->fresh()->rate, '10', 'a Decimal with no fraction'),
        expect($found->weight, 1.5, 'Float'),
        expect($found->barcode, 2 ** 53 + 1, 'BigInt beyond 2^53'),
        expect(sorted($found->attributes), sorted($json), 'Json, in a column named attributes'),
        expect($found->dimensions, null, 'optional Json'),
        expect(instant($db->table('Product')->where('id', $made->id)->value('released_at')), '2021-02-03T04:05:06.789Z', 'DateTime, in UTC with milliseconds'),
        expect($found->released_at->getTimestampMs(), Carbon::parse('2021-02-03T04:05:06.789Z')->getTimestampMs(), 'DateTime, read back'),
        expect(Account::findOrFail($owner->id)->active, true, 'Boolean'),
        expect($profile->avatar, $avatar, 'Bytes with a zero byte'),
        // A string would be TEXT, which Prisma Client refuses to read as bytes.
        $driver === 'sqlite' ? expect($db->selectOne('SELECT typeof(avatar) AS t FROM profiles WHERE id = ?', [$profile->id])->t, 'blob', 'Bytes stored as a BLOB') : null,
        expect($profile->bio, "two\nlines", 'String with a newline'),
        // json_encode refuses bytes that are not UTF-8: they are base64, as Prisma writes Bytes.
        expect(json_decode($profile->toJson(), true)['avatar'] ?? null, base64_encode($avatar), 'Bytes in toJson(), base64'),
    ];
});

check('an optional field left out is null, in the row and on the model', function () use ($db, $account) {
    $made = $account('optional');
    return [
        expect(Account::findOrFail($made->id)->display_name, null, 'display_name'),
        expect($db->table('accounts')->where('id', $made->id)->value('display_name'), null, 'row'),
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
        expect($new->released_at->getTimestampMs(), Carbon::parse('2020-01-01T00:00:00Z')->getTimestampMs(), 'a DateTime literal, in UTC'),
        expect($new->category_id, 1, 'a foreign key'),
        expect($account->role, Role::CUSTOMER, 'an enum member'),
        expect($account->active, true, 'a Boolean'),
        expect($order->status, OrderStatus::PENDING, 'an enum with no @map'),
    ];
});

// Prisma Client fills now() from its own clock, in UTC; the table fills it from the server's, and
// SQLite's CURRENT_TIMESTAMP writes `2030-01-01 10:00:00` where Prisma writes
// `2030-01-01T09:00:00.000+00:00`: left to the table, a row Eloquent wrote later in the day would sort
// before one Prisma wrote.
check('a now() default is filled by the model as Prisma Client fills it, not by the table', function () use ($db, $driver, $account) {
    $order = Order::create(['account_id' => $account('clock')->id]);
    $given = Order::create(['account_id' => $order->account_id, 'placed_at' => '2030-01-01T09:00:00Z']);
    // A time with no zone is the app's, as Eloquent reads one.
    $local = Order::create(['account_id' => $order->account_id, 'placed_at' => '2030-01-01 09:00:00']);
    $raw = fn (Order $o) => $db->table('orders')->where('order_number', $o->order_number)->value('placed_at');
    return [
        expect($order->placed_at instanceof CarbonInterface, true, 'on the model once it is saved'),
        expect(instant($raw($order)), $order->placed_at->utc()->format('Y-m-d\TH:i:s.v\Z'), 'the same instant in the row'),
        $driver === 'sqlite' ? expect((bool) preg_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}\+00:00$/', $raw($order)), true, 'in ISO 8601 with milliseconds') : null,
        expect(instant($raw($given)), '2030-01-01T09:00:00.000Z', 'a value given is kept'),
        expect(instant($raw($local)), Carbon::parse('2030-01-01 09:00:00', date_default_timezone_get())->utc()->format('Y-m-d\TH:i:s.v\Z'), 'a value with no zone, in the app timezone'),
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
        // Neither trait makes a column that is not the key: the model does, as Prisma Client would.
        expect((bool) preg_match('/^[0-9A-HJKMNP-TV-Z]{26}$/', (string) $order->public_id), true, "a ulid() that is not the key: {$order->public_id}"),
        expect((bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', (string) $wishlist->share_token), true, "a uuid() that is not the key: {$wishlist->share_token}"),
        expect($wishlist->share_token !== $wishlist->id, true, 'a uuid of its own'),
        expect(Order::create(['account_id' => $first->id, 'public_id' => 'GIVEN'])->fresh()->public_id, 'GIVEN', 'a value given is kept'),
    ];
});

check("a cuid() key is Prisma's to make: Eloquent has to be given one", function () {
    $given = Coupon::create(['id' => 'c' . bin2hex(random_bytes(12)), 'code' => 'GIVEN']);
    return [
        expect(thrown(fn () => Coupon::create(['code' => 'KEYLESS'])), QueryException::class, 'a coupon with no key'),
        expect(Coupon::where('code', 'GIVEN')->value('id'), $given->id, 'the key given, mass-assigned'),
    ];
});

check('a model with no @id is keyed by its @unique', function () use ($db) {
    $setting = StoreSetting::create(['key' => 'currency', 'value' => 'EUR']);
    StoreSetting::create(['key' => 'locale', 'value' => 'en']);
    StoreSetting::findOrFail('currency')->update(['value' => 'JPY']);
    StoreSetting::destroy('locale');
    return [
        expect($setting->getKeyName(), 'key', 'a @unique is the key'),
        expect($setting->getIncrementing(), false, 'and is given, not counted'),
        expect($db->table('store_setting')->pluck('value', 'key')->all(), ['currency' => 'JPY'], 'found, updated and destroyed by it'),
    ];
});

// Eloquent has no composite key: a key of several columns is an array of each by name, and
// CompositeKeyBuilder takes it where Eloquent takes a key.
check('a composite primary key is an array of its columns: find(), findOrFail(), destroy() and whereKey() take one', function () use ($db, $account, $product) {
    $order = Order::create(['account_id' => $account('composite')->id]);
    $n = $order->order_number;
    [$one, $two, $three, $four] = array_map(fn (string $sku) => $product($sku), ['COMPOSITE1', 'COMPOSITE2', 'COMPOSITE3', 'COMPOSITE4']);
    foreach ([$one, $two, $three, $four] as $i => $made) {
        LineItem::create(['order_number' => $n, 'product_id' => $made->id, 'unit_price' => '1.00', 'quantity' => $i + 1]);
    }
    $key = fn (Product $made) => ['order_number' => $n, 'product_id' => $made->id];
    $item = LineItem::find($key($one));
    $item->update(['quantity' => 10]);
    $rows = fn () => $db->table('line_items')->where('order_number', $n)->orderBy('quantity')->pluck('quantity')->all();
    return [
        expect($item->getKey(), $key($one), 'getKey(), the array of its columns'),
        expect(LineItem::find($key($one))->quantity, 10, 'find() by the key, after update() by it'),
        expect($item->is(LineItem::find($key($one))), true, 'is() the same row'),
        expect($item->is(LineItem::find($key($two))), false, 'is() not another'),
        expect(LineItem::findMany([$key($one), $key($two)])->count(), 2, 'findMany()'),
        expect(LineItem::find([$key($two), $key($three)])->pluck('quantity')->sort()->values()->all(), [2, 3], 'find() of a list of keys'),
        expect(LineItem::findOrFail($key($two))->quantity, 2, 'findOrFail()'),
        expect(thrown(fn () => LineItem::findOrFail(['order_number' => $n, 'product_id' => 'missing'])), ModelNotFoundException::class, 'findOrFail() of no row'),
        expect(thrown(fn () => LineItem::findOrFail([$key($two), ['order_number' => $n, 'product_id' => 'missing']])), ModelNotFoundException::class, 'findOrFail() of a list with one missing'),
        expect(LineItem::whereKeyNot($key($one))->where('order_number', $n)->count(), 3, 'whereKeyNot()'),
        expect($order->lineItems()->find($key($three))?->quantity, 3, 'find() through a relation'),
        // A part of a key would reach every row the rest of it matches: every line of the order.
        expect(thrown(fn () => LineItem::find($n)), InvalidArgumentException::class, 'find() by one column'),
        expect(thrown(fn () => LineItem::find(['order_number' => $n])), InvalidArgumentException::class, 'find() by a part of the key'),
        expect(thrown(fn () => LineItem::destroy($n)), InvalidArgumentException::class, 'destroy() by one column'),
        expect($rows(), [2, 3, 4, 10], 'nothing destroyed by a part of a key'),
        expect(LineItem::destroy($key($one)), 1, 'destroy() by the key'),
        expect(LineItem::destroy([$key($two), $key($three)]), 2, 'destroy() of a list of keys'),
        expect(LineItem::destroy([]), 0, 'destroy() of no key'),
        expect($rows(), [4], 'the row no key named, left'),
        expect(thrown(fn () => LineItem::create(['order_number' => $n, 'product_id' => $four->id, 'unit_price' => '3.00'])), UniqueConstraintViolationException::class, 'a second row with the key'),
        expect($order->lineItems()->count(), 1, 'hasMany on a key named order_number'),
    ];
});

check('a collection of models with a composite key tells them apart by it', function () use ($account, $product) {
    $order = Order::create(['account_id' => $account('collected')->id]);
    $n = $order->order_number;
    $made = array_map(fn (string $sku) => $product($sku), ['COLLECTED1', 'COLLECTED2', 'COLLECTED3']);
    foreach ($made as $i => $one) {
        LineItem::create(['order_number' => $n, 'product_id' => $one->id, 'unit_price' => '1.00', 'quantity' => $i + 1]);
    }
    [$first, $second] = array_map(fn (Product $one) => ['order_number' => $n, 'product_id' => $one->id], $made);
    $all = LineItem::where('order_number', $n)->orderBy('quantity')->get();
    $quantities = fn ($items) => $items->pluck('quantity')->sort()->values()->all();
    return [
        // Eloquent's own collection keys them all by the string `Array`: unique() leaves one.
        expect($all->unique()->count(), 3, 'unique()'),
        expect($all->find($second)?->quantity, 2, 'find() by a key'),
        expect($quantities($all->find([$first, $second])), [1, 2], 'find() of a list of keys'),
        expect(thrown(fn () => $all->findOrFail(['order_number' => $n, 'product_id' => 'missing'])), ModelNotFoundException::class, 'findOrFail() of no model'),
        expect($quantities($all->only([$first])), [1], 'only()'),
        expect($quantities($all->except($first)), [2, 3], 'except() of a key'),
        expect($quantities($all->diff($all->take(1))), [2, 3], 'diff()'),
        expect($quantities($all->intersect($all->take(2))), [1, 2], 'intersect()'),
        expect($all->contains($all->last()), true, 'contains()'),
        expect($quantities($all->fresh()), [1, 2, 3], 'fresh()'),
        expect($all->toQuery()->count(), 3, 'toQuery(), by whereKey()'),
    ];
});

check('a model with no @id and no single unique is keyed by its @@unique, as a composite key', function () {
    ExchangeRate::create(['base' => 'EUR', 'quote' => 'JPY', 'rate' => '160.50']);
    ExchangeRate::create(['base' => 'EUR', 'quote' => 'USD', 'rate' => '1.00']);
    ExchangeRate::find(['base' => 'EUR', 'quote' => 'JPY'])->update(['rate' => '161.25']);
    ExchangeRate::where(['base' => 'EUR', 'quote' => 'USD'])->firstOrFail()->delete();
    return [
        expect((new ExchangeRate())->getKeyName(), null, 'no one column'),
        expect(ExchangeRate::where('base', 'EUR')->pluck('rate', 'quote')->all(), ['JPY' => '161.25'], 'the pair found, updated and deleted by both columns'),
        expect(thrown(fn () => ExchangeRate::find('EUR')), InvalidArgumentException::class, 'find() by one column'),
    ];
});

check('@@map and @map name the tables and columns, and the models read them by those names', function () use ($db, $account) {
    $made = $account('names');
    $made->update(['display_name' => 'Named']);
    return [
        expect((new Account())->getTable(), 'accounts', '@@map'),
        expect((new Product())->getTable(), 'Product', 'no @@map'),
        expect($db->table('accounts')->where('id', $made->id)->value('display_name'), 'Named', '@map column'),
        expect(Account::where('email_address', 'names@example.com')->value('handle'), 'names', 'queried by column'),
    ];
});

check("PHP's words are plain columns: type, class, function, match, list, static", function () use ($db) {
    $attributes = ['type' => 't', 'class' => 'c', 'function' => 'f', 'match' => 'm', 'list' => 'l', 'static' => true];
    $made = Keyword::create([...$attributes, 'kind' => Kind::CLASS_]);
    $found = Keyword::findOrFail($made->id);
    return [
        expect(array_intersect_key($found->toArray(), $attributes), $attributes, 'read back'),
        expect(Keyword::where('match', 'm')->value('class'), 'c', 'query'),
        expect($found->kind, Kind::CLASS_, 'the case CLASS, named CLASS_'),
        expect($db->table('keywords')->where('id', $made->id)->value('kind'), 'CLASS', 'stored as CLASS'),
    ];
});

check("a doc comment is the class's docblock, a */ in it written *\\/ so the block goes on", fn () => [
    expect(str_contains((string) (new ReflectionClass(Keyword::class))->getDocComment(), 'early: *\\/ and a'), true, 'docblock'),
    expect(str_contains((string) (new ReflectionClass(Mood::class))->getDocComment(), 'an apostrophe and a backslash'), true, "an enum's"),
]);

// --- Enums ----------------------------------------------------------------------------------

check('an enum stores its @map value, loads it back as the case, and refuses others', function () use ($db, $driver, $account) {
    $staff = Account::create(['email_address' => 's@example.com', 'handle' => 'staff', 'role' => Role::STAFF]);
    $admin = Account::create(['email_address' => 'a@example.com', 'handle' => 'admin', 'role' => Role::ADMIN]);
    $db->table('accounts')->insert(['email_address' => 'raw@example.com', 'handle' => 'raw', 'role' => 'customer', 'updated_at' => stored('2025-01-01T00:00:00Z')]);
    $owner = $account('moody');
    Profile::create(['account_id' => $owner->id, 'mood' => Mood::FINE]);
    $order = Order::create(['account_id' => $staff->id, 'status' => OrderStatus::PAID]);
    return [
        expect($db->table('accounts')->whereIn('id', [$staff->id, $admin->id])->orderBy('id')->pluck('role')->all(), ['staff', 'ADMIN'], 'stored'),
        expect(Account::where('handle', 'raw')->firstOrFail()->role, Role::CUSTOMER, 'loaded from customer'),
        expect($db->table('profiles')->where('account_id', $owner->id)->value('mood'), Mood::FINE->value, 'a value with an apostrophe'),
        // provider.ts takes the apostrophe out where `prisma db push` cannot write it, and on
        // MySQL the backslash.
        $driver === 'sqlite' ? expect(Mood::FINE->value, "it's fine", "it's fine") : null,
        expect(Profile::create(['account_id' => $account('escaped')->id, 'mood' => Mood::ESCAPED])->fresh()->mood, Mood::ESCAPED, 'a value with a backslash, read back'),
        $driver !== 'mysql' ? expect(Mood::ESCAPED->value, 'back\\slash', 'back\\slash') : null,
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
        expect($db->table('_ProductToTag')->get(['A', 'B'])->map(fn ($r) => (array) $r)->all(), [['A' => $made->id, 'B' => $tag->id]], 'the row'),
        expect($made->tags()->pluck('name')->all(), ['tagged'], 'product to tags'),
        expect($tag->products()->pluck('sku')->all(), ['TAGGED'], 'tag to products'),
    ];
});

check('a named implicit many-to-many is _Wished, not _ProductToWishlist', function () use ($db, $account, $product) {
    $made = $product('WISHED');
    $wishlist = Wishlist::create(['account_id' => $account('wisher')->id]);
    $wishlist->products()->attach($made->id);
    return [
        expect($db->table('_Wished')->get(['A', 'B'])->map(fn ($r) => (array) $r)->all(), [['A' => $made->id, 'B' => $wishlist->id]], 'the row'),
        expect($made->wishlists()->count(), 1, 'product to wishlists'),
    ];
});

check('a model related to itself many-to-many reads _Follows as Prisma writes it', function () use ($db, $account) {
    $alice = $account('alice');
    $bob = $account('bob');
    // What Prisma Client writes for `bob.following.connect(alice)`: of the two fields, `followers`
    // sorts first, so its model's key is A: A is followed (alice), B is the follower (bob).
    $db->table('_Follows')->insert(['A' => $alice->id, 'B' => $bob->id]);
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

// InnoDB refuses ON DELETE SET DEFAULT: provider.ts leaves it out on MySQL.
if ($driver !== 'mysql') {
    check('onDelete: SetDefault moves a product back to category 1', function () use ($product) {
        $category = Category::create(['name' => 'Seasonal']);
        $made = $product('SEASONAL', ['category_id' => $category->id]);
        $category->delete();
        return [expect($made->fresh()->category_id, 1, 'category_id')];
    });
}

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

// --- Time -----------------------------------------------------------------------------------

check('a DateTime is written as Prisma Client writes it, so the rows of both sort together', function () use ($db, $driver, $account) {
    $early = $account('early');
    $db->table('accounts')->where('id', $early->id)->update(['created_at' => stored('2030-01-01T09:00:00Z')]);
    // A row Prisma Client wrote an hour later the same day.
    $db->table('accounts')->insert(['email_address' => 'late@example.com', 'handle' => 'late', 'created_at' => stored('2030-01-01T10:00:00Z'), 'updated_at' => stored('2030-01-01T10:00:00Z')]);
    $between = Account::create(['email_address' => 'mid@example.com', 'handle' => 'mid']);
    $between->created_at = '2030-01-01T09:30:00.250Z';
    $between->save();
    $raw = $db->table('accounts')->where('id', $between->id)->first();
    return [
        $driver === 'sqlite' ? expect((bool) preg_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}\+00:00$/', $raw->updated_at), true, 'updated_at in ISO 8601 with milliseconds') : null,
        expect(instant($raw->created_at), '2030-01-01T09:30:00.250Z', 'a value set by hand, in UTC with its milliseconds'),
        expect(Account::whereIn('handle', ['early', 'mid', 'late'])->orderBy('created_at')->pluck('handle')->all(), ['early', 'mid', 'late'], 'ordered by the database'),
        expect(Account::where('handle', 'late')->firstOrFail()->created_at->utc()->format('H:i'), '10:00', 'a row Prisma wrote, read as UTC'),
    ];
});

// Laravel binds a date as `Y-m-d H:i:s` in the zone the value has: under Asia/Tokyo nine hours
// off, and on SQLite, which compares the text, not Prisma's form, so an equal instant is not equal.
check('a date a query binds is written as the models write one, and finds the rows Prisma wrote', function () use ($db, $driver, $account) {
    $owner = $account('bound');
    $at = Carbon::parse('2030-06-01T09:00:00.250Z');
    $order = Order::create(['account_id' => $owner->id, 'placed_at' => $at]);
    // A row Prisma Client wrote three hours later, in its own form.
    $db->table('orders')->insert(['account_id' => $owner->id, 'public_id' => 'PRISMA-BOUND', 'placed_at' => stored('2030-06-01T12:00:00Z'), 'changed_at' => stored('2030-06-01T12:00:00Z')]);
    $tokyo = $at->copy()->setTimezone('Asia/Tokyo');
    $bounds = [Carbon::parse('2030-06-01T09:00:00.250Z'), Carbon::parse('2030-06-01T21:00:00', 'Asia/Tokyo')];
    $found = [
        expect(Order::where('placed_at', $tokyo)->value('order_number'), $order->order_number, 'where = a date in another zone'),
        expect(Order::where('placed_at', Carbon::parse('2030-06-01T12:00:00Z'))->value('public_id'), 'PRISMA-BOUND', "where = a row in Prisma's form"),
        expect(Order::whereBetween('placed_at', $bounds)->count(), 2, 'whereBetween, both ends in'),
        expect(Order::where('placed_at', '>', $tokyo)->whereYear('placed_at', 2030)->pluck('public_id')->all(), ['PRISMA-BOUND'], 'where >'),
        // 03:00 on 2030-06-02 in Tokyo is 18:00 on 2030-06-01 in UTC, the date both rows hold.
        expect(Order::whereDate('placed_at', Carbon::parse('2030-06-02 03:00', 'Asia/Tokyo'))->count(), 2, 'whereDate, the UTC date'),
        expect(Order::whereIn('placed_at', [$tokyo])->count(), 1, 'whereIn'),
    ];
    Order::whereKey($order->order_number)->update(['placed_at' => $tokyo->copy()->addHour()]);
    $raw = $db->table('orders')->where('order_number', $order->order_number)->value('placed_at');
    return [
        ...$found,
        expect(instant($raw), '2030-06-01T10:00:00.250Z', 'update() through the query, in UTC'),
        $driver === 'sqlite' ? expect($raw, '2030-06-01T10:00:00.250+00:00', "update() through the query, in Prisma's form") : null,
    ];
});

// SQLite has no date or time types: provider.ts adds Slot on PostgreSQL and MySQL.
if ($driver !== 'sqlite') {
    check('a @db.Date is the UTC date, a @db.Time the UTC time on 1970-01-01, and microseconds are cut to milliseconds', function () use ($db, $driver) {
        // 02:30 on 2030-01-01 in Tokyo is 17:30 on 2029-12-31 in UTC.
        $at = Carbon::parse('2030-01-01 02:30:00.123456', 'Asia/Tokyo');
        $utc = fn (?CarbonInterface $time) => $time?->copy()->utc()->format('Y-m-d\TH:i:s.v\Z');
        $slot = Slot::create(['day' => $at, 'opens_at' => $at, 'precise' => $at, ...($driver === 'mysql' ? ['wide' => $at] : ['zoned' => $at, 'zoned_time' => $at])]);
        $row = $db->table('slots')->where('id', $slot->id)->first();
        $found = Slot::findOrFail($slot->id);
        return [
            expect(substr((string) $row->day, 0, 10), '2029-12-31', '@db.Date holds the UTC date'),
            expect(substr((string) $row->opens_at, 0, 12), '17:30:00.123', '@db.Time holds the UTC time'),
            expect(instant($row->precise), '2029-12-31T17:30:00.123Z', '@db.Timestamp(6) holds milliseconds, as Prisma writes'),
            expect($utc($found->day), '2029-12-31T00:00:00.000Z', '@db.Date read as midnight UTC'),
            expect($utc($found->opens_at), '1970-01-01T17:30:00.123Z', '@db.Time read on 1970-01-01 UTC'),
            expect($utc($found->precise), '2029-12-31T17:30:00.123Z', '@db.Timestamp(6) read'),
            expect($utc((new Slot())->default_day), '2030-01-02T00:00:00.000Z', 'a @db.Date default on a new model'),
            expect(Slot::where('precise', $at)->whereKey($slot->id)->exists(), true, 'found by the time it was given'),
            expect(Slot::whereDate('day', $at)->whereKey($slot->id)->exists(), true, 'whereDate on a @db.Date'),
            ...($driver === 'mysql'
                ? [
                    expect(instant($row->wide), '2029-12-31T17:30:00.123Z', '@db.DateTime(6)'),
                    expect($utc($found->wide), '2029-12-31T17:30:00.123Z', '@db.DateTime(6) read'),
                ]
                : [
                    // Laravel mode runs PostgreSQL's session in Asia/Tokyo: the offset the model
                    // writes keeps the instant.
                    expect(instant($row->zoned), '2029-12-31T17:30:00.123Z', '@db.Timestamptz holds the instant, whatever the session zone'),
                    expect($utc($found->zoned), '2029-12-31T17:30:00.123Z', '@db.Timestamptz read'),
                    expect($utc($found->zoned_time), '1970-01-01T17:30:00.123Z', '@db.Timetz read as Prisma reads it, the offset dropped'),
                ]),
        ];
    });
}

// --- Timestamps -----------------------------------------------------------------------------

check("timestamps are filled under Prisma's column names and bumped by an update", function () use ($db, $account, $product) {
    $past = '2000-01-01T00:00:00Z';
    $owner = $account('stamped');
    $order = Order::create(['account_id' => $owner->id]);
    $made = $product('STAMPED');
    $db->table('accounts')->where('id', $owner->id)->update(['updated_at' => stored($past)]);
    $db->table('orders')->where('order_number', $order->order_number)->update(['changed_at' => stored($past)]);
    $db->table('Product')->where('id', $made->id)->update(['updatedAt' => stored($past)]);
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

check('a second @updatedAt is filled and bumped with the one Eloquent keeps, and a value given is kept', function () use ($db) {
    $past = '2000-01-01T00:00:00.000Z';
    $row = fn () => $db->table('store_setting')->where('key', 'synced')->first();
    $setting = StoreSetting::create(['key' => 'synced', 'value' => 'a']);
    $filled = $row();
    $db->table('store_setting')->where('key', 'synced')->update(['updated_at' => stored($past), 'synced_at' => stored($past)]);
    StoreSetting::findOrFail('synced')->save();
    $untouched = instant($row()->synced_at);
    StoreSetting::findOrFail('synced')->update(['value' => 'b']);
    $bumped = $row();
    StoreSetting::findOrFail('synced')->update(['value' => 'c', 'synced_at' => '2020-01-01T00:00:00Z']);
    return [
        expect($setting->synced_at instanceof CarbonInterface, true, 'on the model once it is saved'),
        expect(instant($filled->synced_at), instant($filled->updated_at), 'filled at the same moment as updated_at'),
        expect($untouched, $past, 'a save with nothing changed changes nothing'),
        expect(instant($bumped->synced_at) > $past && instant($bumped->synced_at) === instant($bumped->updated_at), true, 'both bumped together by an update'),
        expect(instant($row()->synced_at), '2020-01-01T00:00:00.000Z', 'a value given'),
    ];
});
