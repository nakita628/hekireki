<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * Implicit many-to-many partner of Post (join table `_PostToTag`).
 */
class Tag extends Model
{
    protected $table = 'tag';

    public $timestamps = false;

    protected $fillable = [
        'label',
    ];

    public function posts(): BelongsToMany
    {
        return $this->belongsToMany(Post::class, '_PostToTag', 'B', 'A');
    }
}