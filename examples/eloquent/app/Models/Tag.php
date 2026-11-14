<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Str;

/**
 * The implicit many-to-many with Product: `_ProductToTag`, columns A (Product) and B (Tag). A
 * ulid() key.
 */
class Tag extends Model
{
    use HasUlids;

    protected $table = 'Tag';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'name',
    ];

    public function newUniqueId()
    {
        return (string) Str::ulid();
    }

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, '_ProductToTag', 'B', 'A');
    }
}