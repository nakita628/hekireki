<?php

namespace App\Models;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;

/**
 * A Prisma Decimal column, read as the string Prisma's Decimal prints: no float, and no zeros a
 * column's scale pads it with.
 */
class AsDecimal implements CastsAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if ($value === null) {
            return null;
        }
        $number = (string) $value;
        if (is_float($value) && str_contains($number, 'E')) {
            $number = number_format($value, 20, '.', '');
        }
        if (str_contains($number, '.')) {
            $number = rtrim(rtrim($number, '0'), '.');
        }

        return $number === '-0' ? '0' : $number;
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): mixed
    {
        return is_float($value) ? (string) $value : $value;
    }
}