<?php

// The rows interop.ts wrote with Prisma Client, read through the generated models: each type as
// Prisma stored it, and the join tables as Prisma's own `connect` filled them. The database and
// the models are bootstrap.php's.
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

use App\Models\Account;
use App\Models\ExchangeRate;
use App\Models\Mood;
use App\Models\Order;
use App\Models\Product;
use App\Models\Role;
use App\Models\StoreSetting;
use App\Models\Tag;

check('Eloquent reads each type Prisma Client wrote', function () {
    $product = Product::where('sku', 'PRISMA')->firstOrFail();
    $bob = Account::where('handle', 'bob.prisma')->firstOrFail();
    return [
        expect($product->price, '1.1', 'Decimal'),
        expect($product->barcode, 2 ** 53 + 3, 'BigInt beyond 2^53'),
        expect($product->attributes, ['from' => ['prisma']], 'Json'),
        expect($product->released_at->utc()->format('Y-m-d\TH:i:s.v\Z'), '2022-03-04T05:06:07.890Z', 'DateTime, in UTC, milliseconds and all'),
        expect($product->label, 'it\'s "quoted" \\ back', 'a default the database filled'),
        expect($bob->profile->avatar, "\x00\x01\x02\xff", 'Bytes'),
        expect($bob->profile->mood, Mood::SO_SO, 'an enum stored as its @map value'),
        expect(Account::where('handle', 'alice.prisma')->firstOrFail()->role, Role::ADMIN, 'an enum with no @map'),
    ];
});

check('Eloquent reads the rows of models with no @id that Prisma Client wrote, and orders sort with its own', function () {
    $setting = StoreSetting::findOrFail('prisma');
    $setting->update(['value' => 'updated by Eloquent']);
    $rate = ExchangeRate::findOrFail(['base' => 'USD', 'quote' => 'EUR']);
    $rate->update(['rate' => '0.95']);
    $prisma = Order::where('note', 'placed by Prisma')->firstOrFail();
    // Placed after Prisma's, later the same day: in SQLite's own form it would sort first.
    $eloquent = Order::create(['account_id' => $prisma->account_id, 'note' => 'placed by Eloquent']);
    return [
        expect(StoreSetting::findOrFail('prisma')->value, 'updated by Eloquent', 'found and updated by its @unique'),
        expect($setting->synced_at->equalTo($setting->updated_at), true, 'both @updatedAt bumped together'),
        expect(ExchangeRate::find(['base' => 'USD', 'quote' => 'EUR'])->rate, '0.95', 'found and updated by the pair'),
        expect(Order::whereIn('note', ['placed by Prisma', 'placed by Eloquent'])->orderBy('placed_at')->pluck('note')->all(), ['placed by Prisma', 'placed by Eloquent'], 'ordered by placed_at'),
        expect($prisma->placed_at->lessThanOrEqualTo($eloquent->placed_at), true, 'and in time'),
    ];
});

check("Eloquent follows the join tables Prisma Client's connect filled", function () {
    $alice = Account::where('handle', 'alice.prisma')->firstOrFail();
    $bob = Account::where('handle', 'bob.prisma')->firstOrFail();
    $product = Product::where('sku', 'PRISMA')->firstOrFail();
    return [
        expect($bob->following()->pluck('handle')->all(), ['alice.prisma'], 'who bob follows'),
        expect($alice->followers()->pluck('handle')->all(), ['bob.prisma'], "alice's followers"),
        expect($alice->following()->count(), 0, 'alice follows no one'),
        expect($product->tags()->pluck('name')->all(), ['prisma'], 'product to tags'),
        expect(Tag::where('name', 'prisma')->firstOrFail()->products()->pluck('sku')->all(), ['PRISMA'], 'tag to products'),
        expect($bob->wishlist->products()->pluck('sku')->all(), ['PRISMA'], 'wishlist to products, through _Wished'),
    ];
});
