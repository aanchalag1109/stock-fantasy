<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContestPerformancePrize extends Model
{
    protected $fillable = [
        'contest_id',
        'rank_label',
        'rank_start',
        'rank_end',
        'winners_count',
        'percentage',
        'prize_amount',
        'per_winner_amount',
        'total_pool',
        'platform_fee',
        'prize_pool',
        'total_participants',
        'total_winners'
    ];

    public function contest()
    {
        return $this->belongsTo(Contest::class);
    }
}