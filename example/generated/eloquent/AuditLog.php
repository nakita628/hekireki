<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * DB-side generated defaults (dbgenerated) plus Json / Bytes payloads.
 */
class AuditLog extends Model
{
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
}