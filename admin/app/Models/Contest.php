<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Contest extends Model
{
    public function joinedCount()
    {
        return \DB::table('saved_baskets')->where('contest_id', $this->id)->count();
    }
    public function rankDetails()
    {
        return $this->hasMany(ContestRankDetail::class);
    }


    use HasFactory;

    protected $fillable = [
        'name',
        'status',
        'category',
        'entry_fee',
        'participants',
        'platform_fee',
        'winning_percentage',
        'group_size',
        'prize_pool',
        'total_pool',
        'platform_fee_amount',
        'total_winners',
        'league_session_id',
        'prize_distribution',
        'max_entries_per_user',
        'is_pinned',
        'pin_order',
        'is_fixed_prize',
        'bot_count',
        'bot_join_minutes_before',
        'bots_joined',
        'bot_join_at',
    ];

    protected $casts = [
        'is_pinned'      => 'boolean',
        'is_fixed_prize' => 'boolean',
        'bots_joined'    => 'boolean',
    ];

    // Guaranteed / Practice = fixed prize (not dynamic)
    public function isFixedPrize(): bool
    {
        return $this->is_fixed_prize || in_array($this->category, ['guaranteed', 'practice']);
    }

    protected $appends = ['session_status', 'start_time', 'end_time'];

    public function prizeDistributions()
    {
        return $this->hasMany(ContestPrizeDistribution::class);
    }

    public function leagueSession()
    {
        return $this->belongsTo(\App\Models\LeagueSession::class, 'league_session_id');
    }

    public function savedBaskets()
    {
        return $this->hasMany(SavedBasket::class, 'contest_id');
    }

    public function entries()
    {
        return $this->hasMany(ContestEntry::class);
    }

    public function calculatePrizePool()
    {
        return $this->entries()->sum('entry_fee');
    }

    // Get status from league session
    public function getSessionStatusAttribute()
    {
        return $this->leagueSession ? $this->leagueSession->status : 'upcoming';
    }

    // Get start time from league session
    public function getStartTimeAttribute()
    {
        return $this->leagueSession ? $this->leagueSession->start_time : null;
    }

    // Get end time from league session
    public function getEndTimeAttribute()
    {
        return $this->leagueSession ? $this->leagueSession->end_time : null;
    }

}