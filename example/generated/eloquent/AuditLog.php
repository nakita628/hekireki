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
        'action',
        'payload',
        'signature',
        'logged_at',
    ];

    protected $casts = [
        'payload' => 'array',
        'logged_at' => 'datetime',
    ];
}