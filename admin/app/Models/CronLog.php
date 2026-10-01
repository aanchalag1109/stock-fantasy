<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CronLog extends Model
{
    protected $fillable = [
        'run_time',
        'status',
        'output',
        'type'
    ];
}
