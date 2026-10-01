<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PrizeDistribution extends Model
{
    protected $fillable = ['winner_count', 'distribution_data'];
    
    protected $casts = [
        'distribution_data' => 'array'
    ];
}