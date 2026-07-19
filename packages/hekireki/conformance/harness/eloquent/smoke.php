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
echo "ok: {$models} models, {$enums} enums resolved\n";
