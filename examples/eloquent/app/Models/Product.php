<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasVersion4Uuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A uuid() key Prisma's client makes, so Eloquent has to, and timestamps under Prisma's camel-case
 * names. A column named `attributes`, the property Eloquent keeps a model's columns in.
 */
class Product extends Model
{
    use HasVersion4Uuids;

    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $table = 'Product';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'sku',
        'name',
        'price',
        'weight',
        'barcode',
        'stock',
        'attributes',
        'dimensions',
        'label',
        'released_at',
        'category_id',
    ];

    protected $attributes = [
        'weight' => 0.0,
        'stock' => -1,
        'label' => 'it\'s "quoted" \\ back',
        'released_at' => '2020-01-01T00:00:00.000Z',
        'category_id' => 1,
    ];

    protected $casts = [
        'weight' => 'float',
        'barcode' => 'integer',
        'stock' => 'integer',
        'attributes' => 'array',
        'dimensions' => 'array',
        'released_at' => 'datetime',
        'category_id' => 'integer',
    ];

    public function fromDateTime($value)
    {
        return empty($value) ? $value : $this->asDateTime($value)->setTimezone('UTC')->format('Y-m-d\TH:i:s.v\Z');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class, 'category_id');
    }

    public function lineItems(): HasMany
    {
        return $this->hasMany(LineItem::class, 'product_id');
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(Review::class, 'product_id');
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class, '_ProductToTag', 'A', 'B');
    }

    public function wishlists(): BelongsToMany
    {
        return $this->belongsToMany(Wishlist::class, '_Wished', 'A', 'B');
    }
}