<?php

namespace App\Observers;

use App\Models\LeagueSession;
use App\Models\Contest;

class LeagueSessionObserver
{
    public function updated(LeagueSession $session)
    {
        // Jab session LIVE ho jaye
        if ($session->isDirty('status') && $session->status === 'live') {
            // Check if contests table has status column
            $hasStatusColumn = \Schema::hasColumn('contests', 'status');
            
            if ($hasStatusColumn) {
                Contest::where('league_session_id', $session->id)
                    ->where('status', 'upcoming')
                    ->update(['status' => 'live']);
                
                \Log::info("Session #{$session->id} LIVE - Contests updated");
            } else {
                \Log::info("Session #{$session->id} LIVE - Contests table has no status column");
            }
        }
    }
}
