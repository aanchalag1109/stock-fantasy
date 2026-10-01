<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Contest;
use Illuminate\Support\Facades\DB;

class ForceStartContest extends Command
{
    protected $signature = 'contest:force-start {contest_id}';
    protected $description = 'Force start a contest and save starting prices';

    public function handle()
    {
        $contestId = $this->argument('contest_id');
        
        $contest = Contest::find($contestId);
        if (!$contest) {
            $this->error("Contest {$contestId} not found!");
            return 1;
        }
        
        $this->info("Force starting contest {$contestId}...");
        
        // Update contest status to live
        $contest->update(['status' => 'live']);
        $this->info("✓ Contest status updated to live");
        
        // Get contest entries
        $entries = DB::table('contest_entries')
            ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
            ->where('contest_entries.contest_id', $contestId)
            ->select('contest_entries.id', 'contest_entries.basket_id', 'saved_baskets.assets', 'saved_baskets.multipliers')
            ->get();
        
        if ($entries->isEmpty()) {
            $this->warn("No entries found for this contest!");
            return 0;
        }
        
        $this->info("Found {$entries->count()} entries");
        
        foreach ($entries as $entry) {
            $assets = json_decode($entry->assets, true) ?? [];
            
            if (empty($assets)) {
                $this->warn("Entry {$entry->id} has no assets, skipping...");
                continue;
            }
            
            $startingPrices = [];
            
            foreach ($assets as $asset) {
                $symbol = $asset['symbol'] ?? $asset['name'];
                // Use dummy price for testing
                $price = rand(1000, 5000);
                $startingPrices[$symbol] = $price;
            }
            
            DB::table('contest_entries')
                ->where('id', $entry->id)
                ->update([
                    'starting_prices' => json_encode($startingPrices),
                    'contest_started_at' => now()
                ]);
            
            $this->line("✓ Entry {$entry->id} - Saved prices for " . count($startingPrices) . " assets");
        }
        
        $this->info("\n✅ Contest {$contestId} started successfully!");
        $this->info("Total entries processed: {$entries->count()}");
        
        return 0;
    }
}
