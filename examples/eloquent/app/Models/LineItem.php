<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An explicit many-to-many between Order and Product, keyed by the pair.
 */
class LineItem extends Model
{
    protected $table = 'line_items';

    protected $primaryKey = 'order_number';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'order_number',
        'product_id',
        'quantity',
        'unit_price',
    ];

    protected $attributes = [
        'quantity' => 1,
    ];

    protected $casts = [
        'order_number' => 'integer',
        'quantity' => 'integer',
    ];

    protected function setKeysForSaveQuery($query)
    {
        foreach (['order_number', 'product_id'] as $column) {
            $query->where($column, '=', $this->original[$column] ?? $this->getAttribute($column));
        }

        return $query;
    }

    protected function setKeysForSelectQuery($query)
    {
        foreach (['order_number', 'product_id'] as $column) {
            $query->where($column, '=', $this->original[$column] ?? $this->getAttribute($column));
        }

        return $query;
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_number', 'order_number');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }
}