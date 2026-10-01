<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CronJob extends Model
{
    protected $fillable = [
        'name', 'command', 'type', 'schedule', 'description',
        'is_active', 'last_run_at', 'last_response', 'last_success',
        'api_url', 'api_method', 'api_headers', 'api_body',
    ];

    protected $casts = [
        'is_active'    => 'boolean',
        'last_success' => 'boolean',
        'last_run_at'  => 'datetime',
    ];
}
