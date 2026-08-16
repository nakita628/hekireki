<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One-to-one relation with native @db.* types, literal defaults,
 * and optional scalars of every flavour.
 */
class Profile extends Model
{
    protected $table = 'profile';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'bio',
        'nickname',
        'age',
        'balance',
        'verified',
        'meta',
        'avatar',
        'last_seen',
    ];

    protected $casts = [
        'age' => 'integer',
        'verified' => 'boolean',
        'meta' => 'array',
        'last_seen' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}