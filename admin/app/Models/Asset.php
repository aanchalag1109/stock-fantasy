<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Asset extends Model
{
    protected $fillable = [
        'symbol',
        'name', 
        'type',
        'category_id',
        'image_url',
        'status'
    ];

    public function category()
    {
        return $this->belongsTo(MarketTypeCategory::class, 'category_id');
    }
}