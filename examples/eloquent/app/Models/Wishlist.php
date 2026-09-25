<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasVersion4Uuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Str;

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
        'share_token',
    ];

    protected $casts = [
        'account_id' => 'integer',
    ];

    public function save(array $options = [])
    {
        if (! $this->exists) {
            if (! array_key_exists('share_token', $this->attributes)) {
                $this->setAttribute('share_token', (string) Str::orderedUuid());
            }
        }

        return parent::save($options);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'account_id');
    }

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, '_Wished', 'B', 'A');
    }
}