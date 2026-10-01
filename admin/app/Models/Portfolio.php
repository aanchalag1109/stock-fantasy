<?php

// Portfolio Model: app/Models/Portfolio.php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Portfolio extends Model
{
    use HasFactory;

    protected $fillable = ['user_id', 'contest_id', 'total_score', 'rank', 'winnings'];

    public function user() {
        return $this->belongsTo(User::class);
    }

    public function contest() {
        return $this->belongsTo(Contest::class);
    }

    public function entries() {
        return $this->hasMany(Entry::class);
    }
}