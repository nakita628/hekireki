<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Film extends Model
{
    protected $table = 'film';

    public $timestamps = false;

    protected $fillable = [
        'title',
    ];

    public function actors(): BelongsToMany
    {
        return $this->belongsToMany(Actor::class, '_cast', 'B', 'A');
    }
}