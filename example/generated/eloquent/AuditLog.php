<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * DB-side generated defaults (dbgenerated) plus Json / Bytes payloads.
 */
class AuditLog extends Model
{
    use PrismaDates;

    protected $table = 'audit_logs';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'id',
        'action',
        'payload',
        'signature',
        'logged_at',
    ];

    protected $attributes = [
        'payload' => '{}',
    ];

    protected $casts = [
        'payload' => 'array',
        'signature' => AsBytes::class,
        'logged_at' => 'datetime',
    ];

    public function save(array $options = [])
    {
        if (! $this->exists) {
            if (! array_key_exists('logged_at', $this->attributes)) {
                $this->setAttribute('logged_at', $this->freshTimestamp());
            }
        }

        return parent::save($options);
    }
}