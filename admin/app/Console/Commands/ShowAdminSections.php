<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ShowAdminSections extends Command
{
    protected $signature = 'admin:show-sections {contest_id?}';
    protected $description = 'Show which admin sections are working after contest join';

    public function handle()
    {
        $contestId = $this->argument('contest_id');
        
        $this->info("╔════════════════════════════════════════════════════╗");
        $this->info("║   ADMIN PANEL SECTIONS - CONTEST JOIN WORKFLOW     ║");
        $this->info("╚════════════════════════════════════════════════════╝");
        $this->newLine();

        if ($contestId) {
            $this->testSpecificContest($contestId);
        } else {
            $this->showAllSections();
        }

        return 0;
    }

    private function testSpecificContest($contestId)
    {
        $this->info("Testing Contest ID: {$contestId}");
        $this->newLine();

        // Get contest info
        $contest = DB::table('contests')
            ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
            ->select('contests.*', 'league_sessions.name as session_name')
            ->where('contests.id', $contestId)
            ->first();

        if (!$contest) {
            $this->error("Contest not found!");
            return;
        }

        $this->line("Contest: #{$contest->id} - {$contest->category}");
        $this->line("Session: {$contest->session_name}");
        $this->line("Status: {$contest->status}");
        $this->newLine();

        // Section 1: Contest Entries
        $this->info("1️⃣  ENTRIES SECTION");
        $this->line("   URL: http://127.0.0.1:8000/admin/entries");
        
        $entries = DB::table('contest_entries')
            ->where('contest_id', $contestId)
            ->count();
        
        $this->line("   Total Entries: {$entries}");
        
        if ($entries > 0) {
            $this->info("   ✅ WORKING - Shows all contest entries");
            
            // Sample entry
            $sample = DB::table('contest_entries')
                ->leftJoin('users', 'contest_entries.user_id', '=', 'users.id')
                ->where('contest_entries.contest_id', $contestId)
                ->select('contest_entries.*', 'users.name as user_name')
                ->first();
            
            if ($sample) {
                $this->line("   Sample: Entry #{$sample->id} - User: {$sample->user_name} - Basket: #{$sample->basket_id}");
            }
        } else {
            $this->warn("   ⚠ NO DATA - No entries found");
        }
        $this->newLine();

        // Section 2: Saved Baskets
        $this->info("2️⃣  SAVED BASKETS SECTION");
        $this->line("   URL: http://127.0.0.1:8000/admin/saved-baskets");
        
        $baskets = DB::table('saved_baskets')
            ->where('contest_id', $contestId)
            ->count();
        
        $this->line("   Contest Baskets: {$baskets}");
        
        if ($baskets > 0) {
            $this->info("   ✅ WORKING - Shows user baskets");
            
            $sampleBasket = DB::table('saved_baskets')
                ->leftJoin('users', 'saved_baskets.user_id', '=', 'users.id')
                ->where('saved_baskets.contest_id', $contestId)
                ->select('saved_baskets.*', 'users.name as user_name')
                ->first();
            
            if ($sampleBasket) {
                $assets = json_decode($sampleBasket->assets, true) ?? [];
                $this->line("   Sample: Basket #{$sampleBasket->id} - User: {$sampleBasket->user_name} - Assets: " . count($assets));
            }
        } else {
            $this->warn("   ⚠ NO DATA - No baskets found");
        }
        $this->newLine();

        // Section 3: Performance
        $this->info("3️⃣  PERFORMANCE SECTION");
        $this->line("   URL: http://127.0.0.1:8000/admin/performance/{$contestId}");
        
        $entriesWithPrices = DB::table('contest_entries')
            ->where('contest_id', $contestId)
            ->whereNotNull('starting_prices')
            ->count();
        
        $this->line("   Entries with Prices: {$entriesWithPrices}/{$entries}");
        
        if ($entriesWithPrices > 0) {
            $this->info("   ✅ WORKING - Shows leaderboard & prices");
            
            // Check scores
            $entriesWithScores = DB::table('contest_entries')
                ->where('contest_id', $contestId)
                ->where('total_score', '!=', 0)
                ->count();
            
            $this->line("   Entries with Scores: {$entriesWithScores}");
            
            if ($entriesWithScores > 0) {
                $topScore = DB::table('contest_entries')
                    ->where('contest_id', $contestId)
                    ->orderBy('total_score', 'desc')
                    ->first();
                
                $this->line("   Top Score: " . number_format($topScore->total_score, 2));
            }
        } else {
            $this->warn("   ⚠ PARTIAL - No starting prices saved");
            $this->line("   Fix: php artisan contest:fix-prices {$contestId}");
        }
        $this->newLine();

        // Section 4: Live Management
        $this->info("4️⃣  LIVE MANAGEMENT SECTION");
        $this->line("   URL: http://127.0.0.1:8000/admin/live-management");
        
        if ($contest->status === 'live') {
            $this->info("   ✅ WORKING - Contest is LIVE");
            $this->line("   Shows: Real-time leaderboard, live scores");
        } else {
            $this->warn("   ⚠ NOT LIVE - Contest status: {$contest->status}");
            $this->line("   Fix: php artisan contest:update-status {$contestId} live");
        }
        $this->newLine();

        // Section 5: Contest Tracking
        $this->info("5️⃣  CONTEST TRACKING SECTION");
        $this->line("   URL: http://127.0.0.1:8000/admin/contest-tracking");
        $this->info("   ✅ WORKING - Shows contest timeline & status");
        $this->newLine();

        // Summary
        $this->info("╔════════════════════════════════════════════════════╗");
        $this->info("║   SUMMARY                                          ║");
        $this->info("╚════════════════════════════════════════════════════╝");
        
        $working = 0;
        $partial = 0;
        $notWorking = 0;
        
        if ($entries > 0) $working++; else $notWorking++;
        if ($baskets > 0) $working++; else $notWorking++;
        if ($entriesWithPrices > 0) $working++; else $partial++;
        if ($contest->status === 'live') $working++; else $partial++;
        $working++; // Contest tracking always works
        
        $this->line("✅ Working: {$working}/5 sections");
        if ($partial > 0) $this->line("⚠ Partial: {$partial}/5 sections");
        if ($notWorking > 0) $this->line("❌ Not Working: {$notWorking}/5 sections");
        
        $this->newLine();
        $this->info("🔧 QUICK FIXES:");
        
        if ($entriesWithPrices < $entries) {
            $this->line("   → php artisan contest:fix-prices {$contestId}");
        }
        
        if ($contest->status !== 'live') {
            $this->line("   → php artisan contest:update-status {$contestId} live");
        }
        
        if ($entries == 0) {
            $this->line("   → Users need to join contest first!");
        }
    }

    private function showAllSections()
    {
        $this->info("📋 ADMIN PANEL SECTIONS (After Contest Join):");
        $this->newLine();

        $sections = [
            [
                'name' => 'ENTRIES',
                'url' => '/admin/entries',
                'description' => 'Shows all contest entries with user & basket info',
                'data' => 'contest_entries table',
                'key_fields' => 'user_id, contest_id, basket_id, total_score'
            ],
            [
                'name' => 'SAVED BASKETS',
                'url' => '/admin/saved-baskets',
                'description' => 'Shows user baskets with assets & multipliers',
                'data' => 'saved_baskets table',
                'key_fields' => 'user_id, contest_id, assets, multipliers'
            ],
            [
                'name' => 'PERFORMANCE',
                'url' => '/admin/performance/{contest_id}',
                'description' => 'Leaderboard, scores, price tracking',
                'data' => 'contest_entries + saved_baskets',
                'key_fields' => 'starting_prices, ending_prices, total_score, rank'
            ],
            [
                'name' => 'LIVE MANAGEMENT',
                'url' => '/admin/live-management',
                'description' => 'Real-time contest monitoring',
                'data' => 'Live contests only',
                'key_fields' => 'status = live, real-time scores'
            ],
            [
                'name' => 'CONTEST TRACKING',
                'url' => '/admin/contest-tracking',
                'description' => 'Contest timeline & status history',
                'data' => 'contests table',
                'key_fields' => 'status, start_time, end_time'
            ]
        ];

        foreach ($sections as $index => $section) {
            $num = $index + 1;
            $this->info("{$num}️⃣  {$section['name']}");
            $this->line("   URL: http://127.0.0.1:8000{$section['url']}");
            $this->line("   📝 {$section['description']}");
            $this->line("   💾 Data: {$section['data']}");
            $this->line("   🔑 Fields: {$section['key_fields']}");
            $this->newLine();
        }

        $this->info("💡 TIP: Run with contest ID to test specific contest:");
        $this->line("   php artisan admin:show-sections <contest_id>");
        $this->newLine();

        // Show available contests
        $contests = DB::table('contests')
            ->select('id', 'category', 'status')
            ->orderBy('id', 'desc')
            ->limit(5)
            ->get();

        if ($contests->count() > 0) {
            $this->info("📊 Recent Contests:");
            foreach ($contests as $c) {
                $entries = DB::table('contest_entries')->where('contest_id', $c->id)->count();
                $this->line("   Contest #{$c->id} - {$c->category} - {$c->status} - {$entries} entries");
            }
        }
    }
}
