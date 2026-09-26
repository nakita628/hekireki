<?php

namespace App\Models;

use DateTimeImmutable;
use DateTimeInterface;
use DateTimeZone;
use Illuminate\Database\Query\Builder;

/**
 * The query of a model with a DateTime: a date is bound as Prisma Client writes one, in UTC with
 * milliseconds, and whereDate() and the other date parts take its UTC date.
 */
class PrismaQueryBuilder extends Builder
{
    const DATE_FORMAT = 'Y-m-d\TH:i:s.vP';

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