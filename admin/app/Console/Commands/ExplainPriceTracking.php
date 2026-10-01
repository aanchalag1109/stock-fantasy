<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ExplainPriceTracking extends Command
{
    protected $signature = 'explain:price-tracking {contest_id?}';
    protected $description = 'Explain how price tracking works';

    public function handle()
    {
        $contestId = $this->argument('contest_id');
        
        $this->info("╔════════════════════════════════════════════════════╗");
        $this->info("║   PRICE TRACKING SYSTEM - HOW IT WORKS            ║");
        $this->info("╚════════════════════════════════════════════════════╝");
        $this->newLine();

        $this->showFlow();
        
        if ($contestId) {
            $this->newLine();
            $this->testContest($contestId);
        }

        return 0;
    }

    private function showFlow()
    {
        $this->info("📊 PRICE TRACKING FLOW:");
        $this->newLine();

        // Step 1
        $this->info("1️⃣  USER JOINS CONTEST");
        $this->line("   → User selects assets (BTC, ETH, RELIANCE, etc.)");
        $this->line("   → Sets multipliers (1x, 2x, 3x)");
        $this->line("   → Sets direction (UP/DOWN)");
        $this->line("   → Saves basket");
        $this->line("   💾 Saved in: saved_baskets table");
        $this->line("      - assets: [{name: 'BTC', symbol: 'BTC-USD'}]");
        $this->line("      - multipliers: [{multiplier: 2, prediction: 'UP'}]");
        $this->newLine();

        // Step 2
        $this->info("2️⃣  CONTEST STARTS (Automatic/Manual)");
        $this->line("   Command: php artisan contest:start");
        $this->line("   OR: php artisan contest:force-start <contest_id>");
        $this->newLine();
        $this->line("   What happens:");
        $this->line("   ✓ Contest status → 'live'");
        $this->line("   ✓ Fetch current prices from API");
        $this->line("   ✓ Save STARTING PRICES");
        $this->line("   💾 Saved in: contest_entries.starting_prices");
        $this->line("      Example: {\"BTC-USD\": 45000, \"ETH-USD\": 3000}");
        $this->newLine();

        // Step 3
        $this->info("3️⃣  LIVE SCORE UPDATES (Every Minute)");
        $this->line("   Command: php artisan contest:update-scores");
        $this->line("   Runs automatically via scheduler");
        $this->newLine();
        $this->line("   What happens:");
        $this->line("   ✓ Fetch CURRENT PRICES from API");
        $this->line("   ✓ Compare with starting prices");
        $this->line("   ✓ Calculate score:");
        $this->line("      Formula: (Current - Start) / Start * 100 * Multiplier");
        $this->line("      If DOWN prediction: Invert the change");
        $this->line("   ✓ Update total_score in contest_entries");
        $this->newLine();
        $this->line("   Example Calculation:");
        $this->line("   - Asset: BTC-USD");
        $this->line("   - Start Price: ₹45,000");
        $this->line("   - Current Price: ₹47,000");
        $this->line("   - Change: +4.44%");
        $this->line("   - Multiplier: 2x");
        $this->line("   - Prediction: UP");
        $this->line("   - Score: 4.44 * 2 = 8.88 points ✅");
        $this->newLine();

        // Step 4
        $this->info("4️⃣  CONTEST ENDS");
        $this->line("   Command: php artisan contest:end (or automatic)");
        $this->newLine();
        $this->line("   What happens:");
        $this->line("   ✓ Contest status → 'completed'");
        $this->line("   ✓ Save ENDING PRICES");
        $this->line("   ✓ Calculate final scores");
        $this->line("   ✓ Assign ranks");
        $this->line("   ✓ Distribute prizes");
        $this->line("   💾 Saved in: contest_entries.ending_prices");
        $this->newLine();

        // Step 5
        $this->info("5️⃣  ADMIN VIEWS PERFORMANCE");
        $this->line("   URL: /admin/performance/<contest_id>");
        $this->newLine();
        $this->line("   Shows:");
        $this->line("   ✓ Leaderboard (sorted by total_score)");
        $this->line("   ✓ Price Changes (Start → Current/End)");
        $this->line("   ✓ User-wise basket performance");
        $this->line("   ✓ Asset-wise profit/loss");
        $this->newLine();

        $this->info("🔄 PRICE SOURCES:");
        $this->line("   📈 Stocks: RapidAPI (NSE/BSE)");
        $this->line("   💰 Crypto: CoinMarketCap API");
        $this->line("   ⏱️  Update Frequency: Every 1 minute (live contests)");
        $this->newLine();

        $this->info("💾 DATABASE TABLES:");
        $this->line("   1. saved_baskets");
        $this->line("      - assets: User selected assets");
        $this->line("      - multipliers: Multipliers & predictions");
        $this->line("      - starting_prices: Prices when contest started");
        $this->line("      - total_score: Current/final score");
        $this->newLine();
        $this->line("   2. contest_entries");
        $this->line("      - basket_id: Link to saved_baskets");
        $this->line("      - starting_prices: Contest start prices");
        $this->line("      - ending_prices: Contest end prices");
        $this->line("      - total_score: Calculated score");
        $this->line("      - rank: User rank in contest");
        $this->newLine();
    }

    private function testContest($contestId)
    {
        $this->info("╔════════════════════════════════════════════════════╗");
        $this->info("║   TESTING CONTEST #{$contestId}                    ");
        $this->info("╚════════════════════════════════════════════════════╝");
        $this->newLine();

        $contest = DB::table('contests')->where('id', $contestId)->first();
        
        if (!$contest) {
            $this->error("Contest not found!");
            return;
        }

        $this->line("Status: {$contest->status}");
        $this->newLine();

        // Get sample entry
        $entry = DB::table('contest_entries')
            ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
            ->leftJoin('users', 'contest_entries.user_id', '=', 'users.id')
            ->where('contest_entries.contest_id', $contestId)
            ->select(
                'contest_entries.*',
                'saved_baskets.assets',
                'saved_baskets.multipliers',
                'users.name as user_name'
            )
            ->first();

        if (!$entry) {
            $this->warn("No entries found for this contest!");
            return;
        }

        $this->info("📋 SAMPLE ENTRY:");
        $this->line("User: {$entry->user_name}");
        $this->line("Basket ID: {$entry->basket_id}");
        $this->line("Total Score: " . number_format($entry->total_score, 2));
        $this->newLine();

        // Parse data
        $assets = json_decode($entry->assets, true) ?? [];
        $multipliers = json_decode($entry->multipliers, true) ?? [];
        $startingPrices = json_decode($entry->starting_prices, true) ?? [];
        $endingPrices = json_decode($entry->ending_prices, true) ?? [];

        if (empty($assets)) {
            $this->warn("No assets in basket!");
            return;
        }

        $this->info("🎯 ASSET BREAKDOWN:");
        $this->newLine();

        $headers = ['Asset', 'Start Price', 'Current/End', 'Change %', 'Multiplier', 'Direction', 'Score'];
        $rows = [];

        foreach ($assets as $index => $asset) {
            $symbol = $asset['symbol'] ?? $asset['name'];
            $startPrice = $startingPrices[$symbol] ?? 0;
            $endPrice = $endingPrices[$symbol] ?? $startPrice;
            
            $multiplier = $multipliers[$index]['multiplier'] ?? 1;
            $direction = $multipliers[$index]['prediction'] ?? 'UP';

            if ($startPrice > 0) {
                $change = (($endPrice - $startPrice) / $startPrice) * 100;
                
                if ($direction === 'DOWN') {
                    $score = (-$change) * $multiplier;
                } else {
                    $score = $change * $multiplier;
                }

                $changeStr = ($change > 0 ? '+' : '') . number_format($change, 2) . '%';
                $scoreStr = ($score > 0 ? '+' : '') . number_format($score, 2);

                $rows[] = [
                    $symbol,
                    number_format($startPrice, 2),
                    number_format($endPrice, 2),
                    $changeStr,
                    $multiplier . 'x',
                    $direction,
                    $scoreStr
                ];
            }
        }

        $this->table($headers, $rows);
        $this->newLine();

        // Status check
        if (empty($startingPrices)) {
            $this->warn("⚠ NO STARTING PRICES!");
            $this->line("Fix: php artisan contest:fix-prices {$contestId}");
        } else {
            $this->info("✅ Starting prices saved: " . count($startingPrices) . " assets");
        }

        if (empty($endingPrices) && $contest->status === 'completed') {
            $this->warn("⚠ NO ENDING PRICES (Contest completed)");
        }

        if ($entry->total_score == 0 && $contest->status === 'live') {
            $this->warn("⚠ Score is 0 - Run score update");
            $this->line("Fix: php artisan contest:update-scores");
        }
    }
}
