<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FlexibleStructure extends Model
{
    protected $fillable = [
        'winner_count',
        'contest_id',
        'rank_start',
        'rank_end',
        'percentage',
        'rank_label'
    ];
}