<?php

namespace App\Models;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Contracts\Database\Eloquent\SerializesCastableAttributes;
use Illuminate\Database\Eloquent\Model;

class AsPrismaList implements CastsAttributes, SerializesCastableAttributes
{
    public function __construct(private string $type = 'string')
    {
    }

    public function get(Model $model, string $key, mixed $value, array $attributes): ?array
    {
        if ($value === null) {
            return null;
        }
        preg_match_all('/"((?:[^"\\\\]++|\\\\.)*+)"|[^,]+/s', substr((string) $value, 1, -1), $items, PREG_SET_ORDER);

        return array_map(fn (array $item) => match (true) {
            isset($item[1]) => $this->read(preg_replace('/\\\\(.)/s', '$1', $item[1])),
            strtoupper($item[0]) === 'NULL' => null,
            default => $this->read($item[0]),
        }, $items);
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if ($value === null || is_string($value)) {
            return $value;
        }

        return '{' . implode(',', array_map(fn ($item) => $item === null && $this->type !== 'json'
            ? 'NULL'
            : '"' . addcslashes($this->write($item), '"\\') . '"', $value)) . '}';
    }

    public function serialize(Model $model, string $key, mixed $value, array $attributes): ?array
    {
        return $value === null ? null : array_map(fn ($item) => match (true) {
            $item instanceof \BackedEnum => $item->value,
            $this->type === 'bytes' && $item !== null => base64_encode($item),
            default => $item,
        }, $value);
    }

    private function read(string $item): mixed
    {
        return match ($this->type) {
            'string' => $item,
            'int' => (int) $item,
            'float' => match ($item) {
                'NaN' => NAN,
                'Infinity' => INF,
                '-Infinity' => -INF,
                default => (float) $item,
            },
            'bool' => $item === 't',
            'decimal' => str_contains($item, '.') ? rtrim(rtrim($item, '0'), '.') : $item,
            'bytes' => str_starts_with($item, '\\x') ? hex2bin(substr($item, 2)) : stripcslashes($item),
            'json' => json_decode($item, true),
            default => $this->type::from($item),
        };
    }

    private function write(mixed $item): string
    {
        return match (true) {
            $item instanceof \BackedEnum => (string) $item->value,
            $this->type === 'json' => json_encode($item),
            $this->type === 'bytes' => '\\x' . bin2hex((string) $item),
            $this->type === 'bool' => $item ? 'true' : 'false',
            is_float($item) && is_nan($item) => 'NaN',
            is_float($item) && is_infinite($item) => $item > 0 ? 'Infinity' : '-Infinity',
            is_float($item) => json_encode($item),
            default => (string) $item,
        };
    }
}