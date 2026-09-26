<?php

namespace App\Models;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Contracts\Database\Eloquent\SerializesCastableAttributes;
use Illuminate\Database\Eloquent\Model;

/**
 * A Prisma Bytes column: written as a stream, which PDO binds as a LOB, read back as the string of
 * its bytes, and serialized as base64.
 */
class AsBytes implements CastsAttributes, SerializesCastableAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if (is_resource($value)) {
            rewind($value);

            return stream_get_contents($value);
        }

        return $value;
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): mixed
    {
        if ($value === null || is_resource($value)) {
            return $value;
        }
        $stream = fopen('php://memory', 'r+b');
        fwrite($stream, (string) $value);
        rewind($stream);

        return $stream;
    }

    public function serialize(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        return $value === null ? null : base64_encode($value);
    }
}