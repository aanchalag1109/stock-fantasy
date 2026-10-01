<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LeagueSession extends Model
{
    protected $table = 'league_sessions';
    protected $fillable = [
        'name', 'market_type', 'max_stocks', 'user_joining_start_time', 'start_time', 'end_time', 'status', 'active', 'stocks', 'cryptos','image_url'
    ];
}
