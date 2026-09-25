<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A cuid() key, which Eloquent has no generator for: the caller gives it.
 */
class Coupon extends Model
{
    protected $table = 'Coupon';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'id',
        'code',
    ];
}