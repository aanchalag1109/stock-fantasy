<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class ContestPrizeDistribution extends Model
{
    use HasFactory;

    protected $fillable = [
        'contest_id',
        'rank_start',
        'rank_end',
        'percent',
        'amount',
    ];

    public function contest()
    {
        return $this->belongsTo(Contest::class);
    }
}
