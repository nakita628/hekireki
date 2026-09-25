<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * BigInt autoincrement primary key (bigserial) and money as Decimal.
 */
class Order extends Model
{
    use PrismaDates;

    protected $table = 'orders';

    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'total',
        'placed_at',
    ];

    protected $casts = [
        'total' => AsDecimal::class,
        'placed_at' => 'datetime',
    ];

    public function save(array $options = [])
    {
        if (! $this->exists) {
            if (! array_key_exists('placed_at', $this->attributes)) {
                $this->setAttribute('placed_at', $this->freshTimestamp());
            }
        }

        return parent::save($options);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class, 'order_id');
    }
}