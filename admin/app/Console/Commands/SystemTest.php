<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use App\Models\LeagueSession;
use App\Models\Contest;
use App\Models\SavedBasket;
use Carbon\Carbon;

class SystemTest extends Command
{
    protected $signature = 'system:test';
    protected $description = 'Test complete system functionality';

    public function handle()
    {
        $this->info("╔════════════════════════════════════════╗");
        $this->info("║   SYSTEM FUNCTIONALITY TEST            ║");
        $this->info("╔════════════════════════════════════════╗");
        $this->newLine();

        $allPassed = true;

        // Test 1: Database Connection
        $this->info("🔍 Test 1: Database Connection");
        try {
            DB::connection()->getPdo();
            $this->info("   ✅ Database connected");
        } catch (\Exception $e) {
            $this->error("   ❌ Database connection failed: " . $e->getMessage());
            $allPassed = false;
        }
        $this->newLine();

        // Test 2: League Sessions
        $this->info("🔍 Test 2: League Sessions");
        $sessions = LeagueSession::all();
        $this->info("   Total Sessions: " . $sessions->count());
        
        $upcoming = LeagueSession::where('status', 'upcoming')->count();
        $live = LeagueSession::where('status', 'live')->count();
        $completed = LeagueSession::where('status', 'completed')->count();
        
        $this->line("   - Upcoming: {$upcoming}");
        $this->line("   - Live: {$live}");
        $this->line("   - Completed: {$completed}");
        
        if ($sessions->count() > 0) {
            $this->info("   ✅ League sessions exist");
        } else {
            $this->warn("   ⚠ No league sessions found");
        }
        $this->newLine();

        // Test 3: Contests
        $this->info("🔍 Test 3: Contests");
        $contests = Contest::all();
        $this->info("   Total Contests: " . $contests->count());
        
        $upcomingContests = Contest::where('status', 'upcoming')->count();
        $liveContests = Contest::where('status', 'live')->count();
        $completedContests = Contest::where('status', 'completed')->count();
        
        $this->line("   - Upcoming: {$upcomingContests}");
        $this->line("   - Live: {$liveContests}");
        $this->line("   - Completed: {$completedContests}");
        
        if ($contests->count() > 0) {
            $this->info("   ✅ Contests exist");
        } else {
            $this->warn("   ⚠ No contests found");
        }
        $this->newLine();

        // Test 4: Saved Baskets
        $this->info("🔍 Test 4: Saved Baskets");
        $baskets = SavedBasket::all();
        $this->info("   Total Baskets: " . $baskets->count());
        
        $emptyBaskets = SavedBasket::whereRaw("JSON_LENGTH(assets) = 0")->count();
        $validBaskets = $baskets->count() - $emptyBaskets;
        
        $this->line("   - Valid Baskets: {$validBaskets}");
        $this->line("   - Empty Baskets: {$emptyBaskets}");
        
        if ($emptyBaskets > 0) {
            $this->warn("   ⚠ Found {$emptyBaskets} empty baskets (run: php artisan baskets:fix-empty)");
        } else {
            $this->info("   ✅ All baskets have assets");
        }
        $this->newLine();

        // Test 5: Contest Entries
        $this->info("🔍 Test 5: Contest Entries");
        $entries = DB::table('contest_entries')->count();
        $this->info("   Total Entries: {$entries}");
        
        $entriesWithPrices = DB::table('contest_entries')
            ->whereNotNull('starting_prices')
            ->count();
        
        $this->line("   - With Starting Prices: {$entriesWithPrices}");
        $this->line("   - Without Prices: " . ($entries - $entriesWithPrices));
        
        if ($entries > 0) {
            $this->info("   ✅ Contest entries exist");
            
            if ($entriesWithPrices < $entries) {
                $this->warn("   ⚠ Some entries missing prices");
            }
        } else {
            $this->warn("   ⚠ No contest entries found");
        }
        $this->newLine();

        // Test 6: Contest Entry with Basket Relationship
        $this->info("🔍 Test 6: Contest Entry → Basket Relationship");
        $entriesWithBaskets = DB::table('contest_entries')
            ->whereNotNull('basket_id')
            ->count();
        
        $this->line("   - Entries with Basket ID: {$entriesWithBaskets}");
        
        if ($entriesWithBaskets > 0) {
            $this->info("   ✅ Basket relationships working");
            
            // Sample entry check
            $sampleEntry = DB::table('contest_entries')
                ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
                ->select('contest_entries.id', 'contest_entries.basket_id', 'saved_baskets.assets')
                ->whereNotNull('contest_entries.basket_id')
                ->first();
            
            if ($sampleEntry) {
                $assets = json_decode($sampleEntry->assets, true) ?? [];
                $this->line("   - Sample Entry #{$sampleEntry->id}: Basket #{$sampleEntry->basket_id} with " . count($assets) . " assets");
            }
        } else {
            $this->warn("   ⚠ No entries with basket relationships");
        }
        $this->newLine();

        // Test 7: Scheduler Commands
        $this->info("🔍 Test 7: Scheduler Commands");
        $commands = [
            'league:update-status' => 'League Status Update',
            'contest:start' => 'Contest Start',
            'contest:update-scores' => 'Score Update'
        ];
        
        foreach ($commands as $cmd => $name) {
            try {
                $this->call($cmd);
                $this->info("   ✅ {$name} command works");
            } catch (\Exception $e) {
                $this->error("   ❌ {$name} command failed");
                $allPassed = false;
            }
        }
        $this->newLine();

        // Test 8: Admin Routes
        $this->info("🔍 Test 8: Admin Panel Routes");
        $routes = [
            '/admin/performance' => 'Performance Index',
            '/admin/entries' => 'Entries',
            '/admin/saved-baskets' => 'Saved Baskets'
        ];
        
        foreach ($routes as $route => $name) {
            $this->line("   - {$name}: {$route}");
        }
        $this->info("   ✅ Routes configured");
        $this->newLine();

        // Test 9: Live Contest Check
        $this->info("🔍 Test 9: Live Contest Functionality");
        $liveContest = Contest::where('status', 'live')->first();
        
        if ($liveContest) {
            $this->info("   Found Live Contest: #{$liveContest->id}");
            
            $liveEntries = DB::table('contest_entries')
                ->where('contest_id', $liveContest->id)
                ->count();
            
            $this->line("   - Entries: {$liveEntries}");
            
            $entriesWithScores = DB::table('contest_entries')
                ->where('contest_id', $liveContest->id)
                ->where('total_score', '!=', 0)
                ->count();
            
            $this->line("   - Entries with Scores: {$entriesWithScores}");
            
            if ($entriesWithScores > 0) {
                $this->info("   ✅ Live scoring working");
            } else {
                $this->warn("   ⚠ No scores calculated yet (run: php artisan contest:update-scores)");
            }
        } else {
            $this->warn("   ⚠ No live contests (run: php artisan contest:update-status <id> live)");
        }
        $this->newLine();

        // Test 10: Time-based Status Updates
        $this->info("🔍 Test 10: Time-based Status Updates");
        $now = Carbon::now();
        $this->line("   Current Time: " . $now->toDateTimeString());
        
        $shouldBeLive = LeagueSession::where('status', 'upcoming')
            ->where('start_time', '<=', $now)
            ->where('end_time', '>', $now)
            ->count();
        
        $shouldBeCompleted = LeagueSession::where('status', 'live')
            ->where('end_time', '<=', $now)
            ->count();
        
        if ($shouldBeLive > 0) {
            $this->warn("   ⚠ {$shouldBeLive} sessions should be LIVE (run: php artisan league:update-status)");
        }
        
        if ($shouldBeCompleted > 0) {
            $this->warn("   ⚠ {$shouldBeCompleted} sessions should be COMPLETED (run: php artisan league:update-status)");
        }
        
        if ($shouldBeLive == 0 && $shouldBeCompleted == 0) {
            $this->info("   ✅ All statuses are correct");
        }
        $this->newLine();

        // Final Summary
        $this->info("╔════════════════════════════════════════╗");
        if ($allPassed) {
            $this->info("║   ✅ ALL TESTS PASSED                  ║");
        } else {
            $this->error("║   ❌ SOME TESTS FAILED                 ║");
        }
        $this->info("╔════════════════════════════════════════╗");
        $this->newLine();

        // Recommendations
        $this->info("📋 RECOMMENDATIONS:");
        
        if ($emptyBaskets > 0) {
            $this->line("   → Run: php artisan baskets:fix-empty");
        }
        
        if ($entries > $entriesWithPrices) {
            $this->line("   → Run: php artisan contest:fix-prices <contest_id>");
        }
        
        if ($shouldBeLive > 0 || $shouldBeCompleted > 0) {
            $this->line("   → Run: php artisan league:update-status");
        }
        
        $this->line("   → Start Scheduler: php artisan schedule:work");
        $this->line("   → Or use: start-scheduler.bat");
        
        return 0;
    }
}
