<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LeagueSessionTemplate extends Model
{
    protected $fillable = [
        'name', 'template_name', 'market_type', 'max_stocks', 'active', 'assets_data',
        'user_joining_start_time', 'start_time', 'end_time', 'status', 'image_url'
    ];

    protected $casts = [
        'assets_data' => 'array',
        'active' => 'boolean'
    ];
}