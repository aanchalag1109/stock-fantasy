<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContestRankDetail extends Model
{
    protected $fillable = [
        'contest_id',
        'rank_start',
        'rank_end',
        'percent',
        'prize',
        'winners',
    ];

    public function contest()
    {
        return $this->belongsTo(Contest::class);
    }
}
