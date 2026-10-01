<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketTypeCategory extends Model
{
    protected $fillable = ['name', 'category_type', 'status'];
    
    public function assets()
    {
        return $this->hasMany(Asset::class, 'category_id');
    }
}