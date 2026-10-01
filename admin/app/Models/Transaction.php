<?php

// Transaction Model: app/Models/Transaction.php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Transaction extends Model
{
    use HasFactory;

    protected $fillable = ['user_id', 'type', 'amount', 'status', 'payment_method', 'transaction_id', 'description'];

    public function user() {
        return $this->belongsTo(User::class);
    }
}