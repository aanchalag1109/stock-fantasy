<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ContestEntry extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'contest_id',
        'basket_id',
        'session_id',
        'entry_fee',
        'selected_stocks',
        'total_score',
        'total_points',
        'rank',
        'winnings',
        'starting_prices',
        'ending_prices'
    ];

    protected $casts = [
        'selected_stocks' => 'array',
        'starting_prices' => 'array',
        'ending_prices' => 'array',
        'entry_fee' => 'decimal:2',
        'total_points' => 'decimal:2',
        'total_score' => 'decimal:2',
        'winnings' => 'decimal:2'
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function contest()
    {
        return $this->belongsTo(Contest::class);
    }

    public function basket()
    {
        return $this->belongsTo(SavedBasket::class, 'basket_id');
    }
}