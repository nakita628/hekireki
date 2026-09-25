<?php

namespace App\Models;

use Illuminate\Support\Facades\Date;

/**
 * A DateTime as Prisma Client keeps it: in UTC with milliseconds, in PrismaQueryBuilder's
 * DATE_FORMAT. A value the caller gives with no zone is in the app's timezone, as Eloquent reads
 * one; one the table holds with no zone is UTC, as Prisma wrote it. The model's queries bind a
 * date the same way.
 */
trait PrismaDates
{
    public function fromDateTime($value)
    {
        return empty($value) ? $value : parent::asDateTime($value)->setTimezone('UTC')->format(PrismaQueryBuilder::DATE_FORMAT);
    }

    protected function asDateTime($value)
    {
        return is_string($value) ? Date::parse($value, 'UTC') : parent::asDateTime($value);
    }

    protected function newBaseQueryBuilder()
    {
        $connection = $this->getConnection();
        $query = new PrismaQueryBuilder($connection, $connection->getQueryGrammar(), $connection->getPostProcessor());
        $query->zonedDates = defined(static::class . '::ZONED_DATES') ? static::ZONED_DATES : [];

        return $query;
    }
}