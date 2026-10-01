<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\ContestEntry;

class ShowContestEntries extends Command
{
    protected $signature = 'contest:show-entries {contest_id?}';
    protected $description = 'Show contest entries with basket details';

    public function handle()
    {
        $contestId = $this->argument('contest_id');
        
        $query = ContestEntry::with(['user', 'contest', 'basket']);
        
        if ($contestId) {
            $query->where('contest_id', $contestId);
        }
        
        $entries = $query->orderBy('total_score', 'desc')->get();
        
        if ($entries->isEmpty()) {
            $this->info('No entries found.');
            return 0;
        }
        
        $this->info("Total Entries: " . $entries->count());
        $this->newLine();
        
        $headers = ['ID', 'User', 'Contest', 'Basket ID', 'Score', 'Created'];
        $rows = [];
        
        foreach ($entries as $entry) {
            $rows[] = [
                $entry->id,
                $entry->user->name ?? 'User #' . $entry->user_id,
                'Contest #' . $entry->contest_id,
                $entry->basket_id ?? 'N/A',
                number_format($entry->total_score, 2),
                $entry->created_at->format('Y-m-d H:i')
            ];
        }
        
        $this->table($headers, $rows);
        
        return 0;
    }
}
