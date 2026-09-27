<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Tag extends Model
{
    protected $table = 'Tag';

    public $timestamps = false;

    protected $fillable = [
        'label',
    ];

    public function posts(): BelongsToMany
    {
        return $this->belongsToMany(Post::class, '_PostToTag', 'B', 'A');
    }
}