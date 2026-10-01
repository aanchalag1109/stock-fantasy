<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class UpdateContestRankings extends Command
{
    protected $signature = 'contest:update-rankings {contest_id?}';
    protected $description = 'Update rankings for contest entries';

    public function handle()
    {
        $contestId = $this->argument('contest_id');
        
        if ($contestId) {
            $this->updateContestRankings($contestId);
            $this->info("Updated rankings for contest {$contestId}");
        } else {
            // Update all contests with NULL rankings
            $contests = DB::table('contest_entries')
                ->whereNull('rank')
                ->distinct()
                ->pluck('contest_id');
            
            foreach ($contests as $id) {
                $this->updateContestRankings($id);
            }
            
            $this->info("Updated rankings for " . count($contests) . " contests");
        }
    }
    
    private function updateContestRankings($contestId)
    {
        $entries = DB::table('contest_entries')
            ->where('contest_id', $contestId)
            ->orderBy('total_score', 'desc')
            ->get();
        
        $rank = 1;
        foreach ($entries as $entry) {
            DB::table('contest_entries')
                ->where('id', $entry->id)
                ->update(['rank' => $rank]);
            $rank++;
        }
    }
}