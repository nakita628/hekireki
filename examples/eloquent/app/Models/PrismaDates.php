<?php

namespace App\Models;

use Illuminate\Support\Facades\Date;

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

        return new PrismaQueryBuilder($connection, $connection->getQueryGrammar(), $connection->getPostProcessor());
    }
}