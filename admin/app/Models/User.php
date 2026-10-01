<?php

// User Model: app/Models/User.php
namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class User extends Authenticatable
{
    use HasFactory, Notifiable;

    protected $fillable = [
        'name','mobile', 'email', 'password', 'wallet_balance', 'deposit_balance', 'winnings_balance', 'total_winnings', 'referral_code', 'referred_by', 'kyc_status', 'fcm_token', 'is_test_user'
    ];

    protected $casts = [
        'wallet_balance' => 'decimal:2',
        'deposit_balance' => 'decimal:2',
        'winnings_balance' => 'decimal:2',
        'is_test_user' => 'boolean',
    ];

    public function portfolios() {
        return $this->hasMany(Portfolio::class);
    }

    public function transactions() {
        return $this->hasMany(Transaction::class);
    }

    public function kycSubmission() {
        return $this->hasOne(KycSubmission::class);
    }
}