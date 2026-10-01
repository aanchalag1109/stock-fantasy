<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class FixContestPrices extends Command
{
    protected $signature = 'contest:fix-prices {contest_id}';
    protected $description = 'Fix and populate starting prices for contest entries';

    public function handle()
    {
        $contestId = $this->argument('contest_id');
        
        $this->info("Checking contest {$contestId}...");
        
        // Check contest exists
        $contest = DB::table('contests')->where('id', $contestId)->first();
        if (!$contest) {
            $this->error("Contest not found!");
            return 1;
        }
        
        $this->info("Contest Status: {$contest->status}");
        
        // Get entries
        $entries = DB::table('contest_entries')
            ->where('contest_id', $contestId)
            ->get();
        
        if ($entries->isEmpty()) {
            $this->warn("No entries found for this contest!");
            return 0;
        }
        
        $this->info("Found {$entries->count()} entries");
        $this->newLine();
        
        $fixed = 0;
        foreach ($entries as $entry) {
            $this->line("Entry ID: {$entry->id}, Basket ID: {$entry->basket_id}");
            
            // Get basket data
            $basket = DB::table('saved_baskets')->where('id', $entry->basket_id)->first();
            
            if (!$basket) {
                $this->warn("  ⚠ Basket not found!");
                continue;
            }
            
            $assets = json_decode($basket->assets, true) ?? [];
            $multipliers = json_decode($basket->multipliers, true) ?? [];
            
            if (empty($assets) && !empty($multipliers)) {
                // Extract assets from multipliers
                $assets = array_map(function($m) {
                    return [
                        'name' => $m['asset_name'] ?? '',
                        'symbol' => $m['asset_name'] ?? ''
                    ];
                }, $multipliers);
                
                $this->line("  ℹ Extracted " . count($assets) . " assets from multipliers");
            }
            
            if (empty($assets)) {
                $this->warn("  ⚠ No assets found!");
                continue;
            }
            
            $this->line("  Assets: " . count($assets));
            
            // Generate starting prices
            $startingPrices = [];
            foreach ($assets as $asset) {
                $symbol = $asset['symbol'] ?? $asset['name'];
                $price = rand(1000, 5000); // Dummy price
                $startingPrices[$symbol] = $price;
            }
            
            // Update entry
            DB::table('contest_entries')
                ->where('id', $entry->id)
                ->update([
                    'starting_prices' => json_encode($startingPrices),
                    'contest_started_at' => now()
                ]);
            
            $this->info("  ✓ Saved prices for " . count($startingPrices) . " assets");
            $fixed++;
        }
        
        $this->newLine();
        $this->info("✅ Fixed {$fixed} entries!");
        
        // Update contest status to live
        DB::table('contests')->where('id', $contestId)->update(['status' => 'live']);
        $this->info("✅ Contest status updated to LIVE");
        
        return 0;
    }
}
