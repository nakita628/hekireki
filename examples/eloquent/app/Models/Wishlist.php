<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasVersion4Uuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * A saved list, one per account, holding products through a named implicit relation: the join
 * table is `_Wished`, not `_ProductToWishlist`.
 */
class Wishlist extends Model
{
    use HasVersion4Uuids;

    protected $table = 'Wishlist';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'account_id',
    ];

    protected $casts = [
        'account_id' => 'integer',
    ];

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'account_id');
    }

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, '_Wished', 'B', 'A');
    }
}