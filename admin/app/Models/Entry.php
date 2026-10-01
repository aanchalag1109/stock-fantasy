<?php

// Entry Model: app/Models/Entry.php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Entry extends Model
{
    use HasFactory;

    protected $fillable = ['portfolio_id', 'symbol', 'buy_price', 'current_price', 'percentage_change', 'score'];

    public function portfolio() {
        return $this->belongsTo(Portfolio::class);
    }
}