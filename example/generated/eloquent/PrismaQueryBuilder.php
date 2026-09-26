<?php

namespace App\Models;

use DateTimeImmutable;
use DateTimeInterface;
use DateTimeZone;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\Query\Expression;

/**
 * The query of a model with a DateTime: a date is bound as Prisma Client writes one, in UTC with
 * milliseconds, and whereDate() and the other date parts take its UTC date.
 */
class PrismaQueryBuilder extends Builder
{
    const DATE_FORMAT = 'Y-m-d H:i:s.vP';

    /** @var list<string> the model's timestamptz columns, whose date and time are taken in UTC */
    public array $zonedDates = [];

    protected function addDateBasedWhere($type, $column, $operator, $value, $boolean = 'and')
    {
        if (is_string($column) && in_array(last(explode('.', $column)), $this->zonedDates, true)) {
            $column = new Expression('(' . $this->grammar->wrap($column) . " at time zone 'UTC')");
        }

        return parent::addDateBasedWhere($type, $column, $operator, $value, $boolean);
    }

    public function castBinding($value)
    {
        return $value instanceof DateTimeInterface
            ? DateTimeImmutable::createFromInterface($value)->setTimezone(new DateTimeZone('UTC'))->format(self::DATE_FORMAT)
            : parent::castBinding($value);
    }

    protected function flattenValue($value)
    {
        $value = parent::flattenValue($value);

        return $value instanceof DateTimeInterface
            ? DateTimeImmutable::createFromInterface($value)->setTimezone(new DateTimeZone('UTC'))
            : $value;
    }
}