<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasVersion4Uuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @@map + @map column names, FK with a referential action,
 * mapped-enum default, and an implicit many-to-many to Tag.
 */
class Post extends Model
{
    use HasVersion4Uuids;

    const UPDATED_AT = null;

    protected $table = 'posts';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'title',
        'content',
        'visibility',
        'published',
        'view_count',
        'author_id',
    ];

    protected $casts = [
        'visibility' => Visibility::class,
        'published' => 'boolean',
        'view_count' => 'integer',
    ];

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(Comment::class, 'post_id');
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class, '_PostToTag', 'A', 'B');
    }
}