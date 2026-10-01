<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ReferralTransaction extends Model
{
    use HasFactory;

    protected $fillable = [
        'promoter_id',
        'referred_user_id',
        'deposit_amount',
        'bonus_amount',
        'bonus_percentage',
        'deposit_number',
        'type'
    ];

    public function promoter()
    {
        return $this->belongsTo(User::class, 'promoter_id');
    }

    public function referredUser()
    {
        return $this->belongsTo(User::class, 'referred_user_id');
    }
}