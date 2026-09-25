<?php

// Loads every generated model and enum against the real Eloquent API — what
// `php -l` cannot see: a relation method colliding with a base Model method,
// a cast pointing at a class that was never generated, an enum case the
// engine rejects. Instantiation and the getters below run without a database
// connection.
declare(strict_types=1);

require __DIR__ . '/vendor/autoload.php';

use Illuminate\Database\Eloquent\Model;

$files = glob(__DIR__ . '/models/*.php');
if ($files === false || $files === []) {
    fwrite(STDERR, "no generated files found in models/\n");
    exit(1);
}
// A model uses a trait or a cast from another file (`PrismaDates`), as it would under
// Composer's PSR-4 autoloading in an app: load a class from its file when it is first named.
spl_autoload_register(function (string $class): void {
    $file = __DIR__ . '/models/' . substr($class, strlen('App\\Models\\')) . '.php';
    if (str_starts_with($class, 'App\\Models\\') && is_file($file)) {
        require_once $file;
    }
});
sort($files);
foreach ($files as $file) {
    require_once $file;
}

$models = 0;
$enums = 0;
foreach (get_declared_classes() as $class) {
    if (!str_starts_with($class, 'App\\Models\\')) {
        continue;
    }
    if (enum_exists($class)) {
        if ($class::cases() === []) {
            fwrite(STDERR, "enum {$class} has no cases\n");
            exit(1);
        }
        $enums++;
        continue;
    }
    if (!is_subclass_of($class, Model::class)) {
        continue;
    }
    $model = new $class();
    $model->getTable();
    $model->getKeyName();
    $model->getFillable();
    foreach ($model->getCasts() as $attribute => $cast) {
        if (str_contains($cast, '\\') && !enum_exists($cast) && !class_exists($cast)) {
            fwrite(STDERR, "cast for {$class}::{$attribute} points at missing {$cast}\n");
            exit(1);
        }
    }
    $models++;
}

if ($models === 0) {
    fwrite(STDERR, "model files loaded but no Eloquent Model subclasses defined\n");
    exit(1);
}

// Enum @map: the backed case value must be the database value, not the name.
if (\App\Models\Visibility::LINK_ONLY->value !== 'link_only') {
    fwrite(STDERR, "enum @map value not honored by Visibility::LINK_ONLY\n");
    exit(1);
}
echo "ok: {$models} models, {$enums} enums resolved\n";
