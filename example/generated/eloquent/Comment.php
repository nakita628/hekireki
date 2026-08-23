<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Two foreign keys with different referential actions
 * (Cascade vs SetNull) and a composite index.
 */
class Comment extends Model
{
    const UPDATED_AT = null;

    protected $table = 'comments';

    protected $fillable = [
        'body',
        'post_id',
        'author_id',
    ];

    public function post(): BelongsTo
    {
        return $this->belongsTo(Post::class, 'post_id');
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }
}