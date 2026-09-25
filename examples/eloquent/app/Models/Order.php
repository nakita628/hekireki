<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * The primary key is not called `id` and has a column of its own. An order cannot be removed
 * while it has line items (Restrict), and its account cannot be removed while it has orders
 * (NoAction). The only timestamp is `@updatedAt`, under a name of its own.
 */
class Order extends Model
{
    const CREATED_AT = null;
    const UPDATED_AT = 'changed_at';

    protected $table = 'orders';

    protected $primaryKey = 'order_number';

    protected $fillable = [
        'account_id',
        'status',
        'note',
        'placed_at',
        'gift_for',
    ];

    protected $attributes = [
        'status' => 'PENDING',
    ];

    protected $casts = [
        'account_id' => 'integer',
        'status' => OrderStatus::class,
        'placed_at' => 'datetime',
    ];

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'account_id');
    }

    public function giftTarget(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'gift_for', 'handle');
    }

    public function lineItems(): HasMany
    {
        return $this->hasMany(LineItem::class, 'order_number', 'order_number');
    }
}