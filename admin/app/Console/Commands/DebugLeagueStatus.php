<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\LeagueSession;
use Carbon\Carbon;

class DebugLeagueStatus extends Command
{
    protected $signature = 'league:debug-status';
    protected $description = 'Debug league session status';

    public function handle()
    {
        $now = Carbon::now();
        
        $this->info("Current Time: " . $now->toDateTimeString());
        $this->newLine();
        
        // Upcoming sessions
        $upcoming = LeagueSession::where('status', 'upcoming')->get();
        $this->info("Upcoming Sessions: " . $upcoming->count());
        foreach ($upcoming as $session) {
            $this->line("ID: {$session->id} | Start: {$session->start_time} | End: {$session->end_time}");
            $this->line("Should be live? " . ($session->start_time <= $now && $session->end_time > $now ? 'YES' : 'NO'));
        }
        $this->newLine();
        
        // Live sessions
        $live = LeagueSession::where('status', 'live')->get();
        $this->info("Live Sessions: " . $live->count());
        foreach ($live as $session) {
            $this->line("ID: {$session->id} | Start: {$session->start_time} | End: {$session->end_time}");
            $this->line("Should be completed? " . ($session->end_time <= $now ? 'YES' : 'NO'));
        }
        $this->newLine();
        
        // Completed sessions
        $completed = LeagueSession::where('status', 'completed')->get();
        $this->info("Completed Sessions: " . $completed->count());
        
        return 0;
    }
}
