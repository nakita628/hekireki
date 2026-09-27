<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

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