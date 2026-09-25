<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A key of two columns, which Eloquent has no relation for: the columns stay, the method does not.
 */
class Shipment extends Model
{
    protected $table = 'shipments';

    public $timestamps = false;

    protected $fillable = [
        'order_number',
        'product_id',
        'carrier',
    ];

    protected $casts = [
        'order_number' => 'integer',
    ];
}