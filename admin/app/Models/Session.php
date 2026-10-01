<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Session extends Model
{
    protected $fillable = [
        'name', 'market_type', 'max_stocks', 'start_time', 'end_time', 'status', 'template_id'
    ];

    // Relationships and logic for stocks, templates, etc. can be added here
}
