<?php

// The rows interop.ts wrote with Prisma Client, read through the generated models: each type as
// Prisma stored it, and the join tables as Prisma's own `connect` filled them. Each check prints
// `ok: <name>`, or stops with what it saw.
declare(strict_types=1);

require __DIR__ . '/vendor/autoload.php';

use App\Models\Account;
use App\Models\Mood;
use App\Models\Product;
use App\Models\Role;
use App\Models\Tag;
use Carbon\CarbonInterface;
use Illuminate\Database\Capsule\Manager as Capsule;

$capsule = new Capsule();
$capsule->addConnection([
    'driver' => 'sqlite',
    'database' => __DIR__ . '/dev.db',
    'foreign_key_constraints' => true,
]);
$capsule->setAsGlobal();
$capsule->bootEloquent();

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

check('Eloquent reads each type Prisma Client wrote', function () {
    $product = Product::where('sku', 'PRISMA')->firstOrFail();
    $bob = Account::where('handle', 'bob.prisma')->firstOrFail();
    return [
        expect((string) $product->price, '1.1', 'Decimal'),
        expect($product->barcode, 2 ** 53 + 3, 'BigInt beyond 2^53'),
        expect($product->attributes, ['from' => ['prisma']], 'Json'),
        expect($product->released_at instanceof CarbonInterface ? $product->released_at->format('Y-m-d\TH:i:s.vP') : null, '2022-03-04T05:06:07.890+00:00', 'DateTime, milliseconds and all'),
        expect($product->label, 'it\'s "quoted" \\ back', 'a default the database filled'),
        expect($bob->profile->avatar, "\x00\x01\x02\xff", 'Bytes'),
        expect($bob->profile->mood, Mood::SO_SO, 'an enum stored as its @map value'),
        expect(Account::where('handle', 'alice.prisma')->firstOrFail()->role, Role::ADMIN, 'an enum with no @map'),
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
