<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One-to-one relation with native @db.* types, literal defaults,
 * and optional scalars of every flavour. ConfigDict passthrough: the
 * Pydantic model rejects unknown keys (extra='forbid').
 */
class Profile extends Model
{
    protected $table = 'Profile';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'id',
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

    protected $attributes = [
        'nickname' => 'anonymous',
        'balance' => '0',
        'verified' => false,
    ];

    protected $casts = [
        'age' => 'integer',
        'balance' => AsDecimal::class,
        'verified' => 'boolean',
        'meta' => 'array',
        'avatar' => AsBytes::class,
        'last_seen' => 'datetime',
    ];

    public function fromDateTime($value)
    {
        return empty($value) ? $value : parent::asDateTime($value)->setTimezone('UTC')->format('Y-m-d H:i:s.v');
    }

    protected function asDateTime($value)
    {
        if (is_string($value) && preg_match('/^\d{4}-\d\d-\d\d[ T][\d:.]+$/', $value)) {
            $value .= '+00:00';
        }

        return parent::asDateTime($value);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}