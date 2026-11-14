<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One review per account per product (a composite unique). Replies point at the review they
 * answer and go with it (a self relation that cascades).
 */
class Review extends Model
{
    protected $table = 'reviews';

    public $timestamps = false;

    protected $fillable = [
        'product_id',
        'account_id',
        'rating',
        'body',
        'parent_id',
    ];

    protected $casts = [
        'account_id' => 'integer',
        'rating' => 'integer',
        'parent_id' => 'integer',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'account_id');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Review::class, 'parent_id');
    }

    public function replies(): HasMany
    {
        return $this->hasMany(Review::class, 'parent_id');
    }
}