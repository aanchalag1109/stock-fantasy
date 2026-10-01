<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Carbon\Carbon;

Route::get('/complete-test', function() {
    $results = [];
    $startTime = microtime(true);
    
    try {
        DB::beginTransaction();
        
        // 1. Create Session
        $sessionId = DB::table('league_sessions')->insertGetId([
            'name' => 'Test Session ' . date('Y-m-d H:i:s'),
            'market_type' => 'stock',
            'max_stocks' => 5,
            'status' => 'upcoming',
            'start_time' => Carbon::now()->addMinutes(1),
            'end_time' => Carbon::now()->addHours(2),
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now()
        ]);
        $results['session_created'] = $sessionId;
        
        // 2. Create Contest
        $contestId = DB::table('contests')->insertGetId([
            'league_session_id' => $sessionId,
            'category' => 'mega',
            'participants' => 10,
            'max_entries_per_user' => '1',
            'entry_fee' => 100,
            'platform_fee' => 10,
            'winning_percentage' => 80,
            'prize_pool' => '800',
            'total_winners' => 3,
            'status' => 'upcoming',
            'start_time' => Carbon::now()->addMinutes(1)->format('Y-m-d H:i:s'),
            'end_time' => Carbon::now()->addHours(2)->format('Y-m-d H:i:s'),
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now()
        ]);
        $results['contest_created'] = $contestId;
        
        // 3. Create 5 Test Users
        $userIds = [];
        for ($i = 1; $i <= 5; $i++) {
            $userId = DB::table('users')->insertGetId([
                'name' => "Test User $i",
                'email' => "testuser$i@test.com",
                'mobile' => "+91 99999999" . str_pad($i, 2, '0', STR_PAD_LEFT),
                'password' => Hash::make('password'),
                'wallet_balance' => 1000,
                'deposit_balance' => 1000,
                'winnings_balance' => 0,
                'referral_code' => 'TEST' . $i,
                'created_at' => Carbon::now(),
                'updated_at' => Carbon::now()
            ]);
            $userIds[] = $userId;
        }
        $results['users_created'] = $userIds;
        
        // 4. Create Sample Assets
        $assets = [
            ['symbol' => 'RELIANCE', 'name' => 'Reliance Industries', 'type' => 'stock'],
            ['symbol' => 'TCS', 'name' => 'Tata Consultancy Services', 'type' => 'stock'],
            ['symbol' => 'INFY', 'name' => 'Infosys Limited', 'type' => 'stock'],
            ['symbol' => 'HDFC', 'name' => 'HDFC Bank', 'type' => 'stock'],
            ['symbol' => 'ICICI', 'name' => 'ICICI Bank', 'type' => 'stock']
        ];
        
        // 5. Create Portfolios for Each User
        $basketIds = [];
        foreach ($userIds as $index => $userId) {
            // Random selection of 3 assets
            $selectedAssets = array_slice($assets, $index % 3, 3);
            $multipliers = [1.5, 2.0, 1.2];
            
            $basketId = DB::table('saved_baskets')->insertGetId([
                'user_id' => $userId,
                'contest_id' => $contestId,
                'session_id' => $sessionId,
                'assets' => json_encode($selectedAssets),
                'multipliers' => json_encode($multipliers),
                'total_score' => 0,
                'is_standalone' => 0,
                'created_at' => Carbon::now(),
                'updated_at' => Carbon::now()
            ]);
            $basketIds[] = $basketId;
            
            // Deduct entry fee
            DB::table('users')->where('id', $userId)->update([
                'deposit_balance' => 900,
                'wallet_balance' => 900
            ]);
            
            // Add transaction
            DB::table('transactions')->insert([
                'user_id' => $userId,
                'type' => 'contest_entry',
                'amount' => 100,
                'description' => "Contest entry fee - Contest #$contestId",
                'created_at' => Carbon::now(),
                'updated_at' => Carbon::now()
            ]);
        }
        $results['portfolios_created'] = $basketIds;
        
        // 6. Start Contest (Update Status)
        DB::table('league_sessions')->where('id', $sessionId)->update([
            'status' => 'live',
            'updated_at' => Carbon::now()
        ]);
        
        DB::table('contests')->where('id', $contestId)->update([
            'status' => 'live',
            'updated_at' => Carbon::now()
        ]);
        
        // 7. Save Start Prices
        $startPrices = [];
        foreach ($assets as $asset) {
            $price = rand(1000, 5000); // Random start price
            DB::table('contest_start_prices')->insert([
                'contest_id' => $contestId,
                'symbol' => $asset['symbol'],
                'start_price' => $price,
                'timestamp' => Carbon::now(),
                'created_at' => Carbon::now(),
                'updated_at' => Carbon::now()
            ]);
            $startPrices[$asset['symbol']] = $price;
        }
        $results['start_prices'] = $startPrices;
        
        // 8. End Contest and Save End Prices
        DB::table('contests')->where('id', $contestId)->update([
            'status' => 'completed',
            'updated_at' => Carbon::now()
        ]);
        
        $endPrices = [];
        foreach ($assets as $asset) {
            $startPrice = $startPrices[$asset['symbol']];
            $change = rand(-20, 30); // -20% to +30% change
            $endPrice = $startPrice + ($startPrice * $change / 100);
            
            DB::table('contest_end_prices')->insert([
                'contest_id' => $contestId,
                'symbol' => $asset['symbol'],
                'end_price' => $endPrice,
                'timestamp' => Carbon::now(),
                'created_at' => Carbon::now(),
                'updated_at' => Carbon::now()
            ]);
            $endPrices[$asset['symbol']] = $endPrice;
        }
        $results['end_prices'] = $endPrices;
        
        // 9. Calculate Results
        $contestResults = [];
        foreach ($basketIds as $index => $basketId) {
            $basket = DB::table('saved_baskets')->where('id', $basketId)->first();
            $assets = json_decode($basket->assets, true);
            $multipliers = json_decode($basket->multipliers, true);
            
            $totalScore = 0;
            $assetScores = [];
            
            foreach ($assets as $assetIndex => $asset) {
                $symbol = $asset['symbol'];
                $startPrice = $startPrices[$symbol];
                $endPrice = $endPrices[$symbol];
                $multiplier = $multipliers[$assetIndex];
                
                $percentChange = (($endPrice - $startPrice) / $startPrice) * 100;
                $score = $percentChange * $multiplier;
                $totalScore += $score;
                
                $assetScores[] = [
                    'symbol' => $symbol,
                    'start_price' => $startPrice,
                    'end_price' => $endPrice,
                    'percent_change' => round($percentChange, 2),
                    'multiplier' => $multiplier,
                    'score' => round($score, 2)
                ];
            }
            
            // Update basket score
            DB::table('saved_baskets')->where('id', $basketId)->update([
                'total_score' => $totalScore,
                'updated_at' => Carbon::now()
            ]);
            
            // Save contest result
            DB::table('contest_results')->insert([
                'contest_id' => $contestId,
                'user_id' => $basket->user_id,
                'basket_id' => $basketId,
                'total_score' => $totalScore,
                'asset_scores' => json_encode($assetScores),
                'created_at' => Carbon::now(),
                'updated_at' => Carbon::now()
            ]);
            
            $contestResults[] = [
                'user_id' => $basket->user_id,
                'basket_id' => $basketId,
                'total_score' => round($totalScore, 2),
                'asset_scores' => $assetScores
            ];
        }
        
        // 10. Calculate Ranks
        usort($contestResults, function($a, $b) {
            return $b['total_score'] <=> $a['total_score'];
        });
        
        foreach ($contestResults as $rank => $result) {
            $actualRank = $rank + 1;
            DB::table('contest_results')
                ->where('contest_id', $contestId)
                ->where('user_id', $result['user_id'])
                ->update(['rank' => $actualRank]);
                
            DB::table('saved_baskets')
                ->where('id', $result['basket_id'])
                ->update(['rank' => $actualRank]);
        }
        
        $results['contest_results'] = $contestResults;
        
        // 11. Get Final Leaderboard
        $leaderboard = DB::table('contest_results')
            ->leftJoin('users', 'contest_results.user_id', '=', 'users.id')
            ->select('contest_results.*', 'users.name as user_name')
            ->where('contest_results.contest_id', $contestId)
            ->orderBy('contest_results.rank')
            ->get();
            
        $results['final_leaderboard'] = $leaderboard->map(function($entry) {
            return [
                'rank' => $entry->rank,
                'user_name' => $entry->user_name,
                'total_score' => round($entry->total_score, 2),
                'asset_scores' => json_decode($entry->asset_scores, true)
            ];
        });
        
        DB::commit();
        
        $endTime = microtime(true);
        
        return response()->json([
            'test_status' => 'SUCCESS',
            'execution_time' => round($endTime - $startTime, 2) . 's',
            'summary' => [
                'session_id' => $sessionId,
                'contest_id' => $contestId,
                'users_created' => count($userIds),
                'portfolios_created' => count($basketIds),
                'contest_completed' => true,
                'results_calculated' => true
            ],
            'results' => $results
        ], 200, [], JSON_PRETTY_PRINT);
        
    } catch (Exception $e) {
        DB::rollback();
        return response()->json([
            'test_status' => 'FAILED',
            'error' => $e->getMessage(),
            'line' => $e->getLine()
        ], 500);
    }
});