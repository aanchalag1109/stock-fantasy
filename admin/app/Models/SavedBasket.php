<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SavedBasket extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'contest_id',
        'session_id',
        'assets',
        'multipliers',
        'total_score',
        'is_standalone'
    ];

    protected $casts = [
        'assets' => 'array',
        'multipliers' => 'array',
        'is_standalone' => 'boolean'
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function contest()
    {
        return $this->belongsTo(Contest::class);
    }
}