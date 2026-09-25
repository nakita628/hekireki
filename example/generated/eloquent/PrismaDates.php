<?php

namespace App\Models;

use Illuminate\Support\Facades\Date;

/**
 * A DateTime as Prisma Client keeps it: in UTC with milliseconds. A value
 * the caller gives with no zone is in the app's timezone, as Eloquent reads one; one the table
 * holds with no zone is UTC, as Prisma wrote it.
 */
trait PrismaDates
{
    public function fromDateTime($value)
    {
        return empty($value) ? $value : parent::asDateTime($value)->setTimezone('UTC')->format('Y-m-d H:i:s.v');
    }

    protected function asDateTime($value)
    {
        return is_string($value) ? Date::parse($value, 'UTC') : parent::asDateTime($value);
    }
}