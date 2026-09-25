<?php

// What check.php and interop.php share: the connection, opened as the run asks, the models to
// load, and how a check reports. Each check prints `ok: <name>`, or stops with what it saw.
//
//   ELOQUENT_DATABASE  a URL (postgresql://…, mysql://…); dev.db beside this file when unset
//   ELOQUENT_MODELS    the directory of models to load; app/Models when unset. provider.ts
//                      writes one per database, as the schema's provider changes what they say
//   ELOQUENT_LARAVEL   1 to open the connection as a Laravel application would: with an event
//                      dispatcher, and Asia/Tokyo for the app's timezone. Otherwise Capsule on
//                      its own, which drops model events, in UTC.
declare(strict_types=1);

require __DIR__ . '/vendor/autoload.php';

use Carbon\Carbon;
use Illuminate\Container\Container;
use Illuminate\Database\Capsule\Manager as Capsule;
use Illuminate\Events\Dispatcher;

$models = getenv('ELOQUENT_MODELS') ?: __DIR__ . '/app/Models';
// Before Composer's own, which maps App\Models to app/Models.
spl_autoload_register(function (string $class) use ($models): void {
    $prefix = 'App\\Models\\';
    $file = $models . '/' . substr($class, strlen($prefix)) . '.php';
    if (str_starts_with($class, $prefix) && is_file($file)) {
        require $file;
    }
}, prepend: true);

$laravel = getenv('ELOQUENT_LARAVEL') === '1';
date_default_timezone_set($laravel ? 'Asia/Tokyo' : 'UTC');

$capsule = new Capsule();
$url = getenv('ELOQUENT_DATABASE');
$capsule->addConnection($url
    ? ['url' => $url]
    : ['driver' => 'sqlite', 'database' => __DIR__ . '/dev.db', 'foreign_key_constraints' => true]);
if ($laravel) {
    $capsule->setEventDispatcher(new Dispatcher(new Container()));
}
$capsule->setAsGlobal();
$capsule->bootEloquent();
$db = $capsule->getConnection();
$driver = $db->getDriverName();

echo "-- {$driver}, " . ($laravel ? 'with events, in Asia/Tokyo' : 'Capsule alone, in UTC') . "\n";

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

/** A time as the table holds it, written by hand: ISO 8601 text on SQLite, as Prisma writes it. */
function stored(string $iso): string
{
    $time = Carbon::parse($iso)->utc();
    return $GLOBALS['driver'] === 'sqlite' ? $time->format('Y-m-d\TH:i:s.v\Z') : $time->format('Y-m-d H:i:s.v');
}

/** The instant a column holds, in UTC ISO 8601: a value with no zone is UTC, as Prisma reads it. */
function instant(mixed $raw): ?string
{
    return $raw === null ? null : Carbon::parse((string) $raw, 'UTC')->utc()->format('Y-m-d\TH:i:s.v\Z');
}

/** Json with its object keys sorted: PostgreSQL's jsonb and MySQL's JSON keep them in an order of their own. */
function sorted(mixed $json): mixed
{
    if (! is_array($json)) {
        return $json;
    }
    if (! array_is_list($json)) {
        ksort($json);
    }
    return array_map('sorted', $json);
}
