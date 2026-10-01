<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class CalculateContestPerformance extends Command
{
    protected $signature = 'contest:calculate-performance';
    protected $description = 'Calculate contest performance, scores, rankings and distribute prizes';

    public function handle()
    {
        $this->info('Starting contest performance calculation...');
        
        // Get all completed sessions
        $completedSessions = DB::table('league_sessions')
            ->where('status', 'completed')
            ->get();

        foreach ($completedSessions as $session) {
            $this->info("Processing session #{$session->id}: {$session->name}");
            
            // Get all contests for this session
            $contests = DB::table('contests')
                ->where('league_session_id', $session->id)
                ->get();

            foreach ($contests as $contest) {
                $this->processContest($contest, $session);
            }
        }
        
        $this->info('Contest performance calculation completed!');
    }

    private function processContest($contest, $session)
    {
        $this->info("  Processing contest #{$contest->id}");
        
        // Check if prizes already distributed using contest flag
        if (isset($contest->prizes_distributed) && $contest->prizes_distributed == 1) {
            $this->warn("  ⚠ Contest #{$contest->id} already processed (prizes_distributed flag set), skipping...");
            return;
        }
        
        // Check if contest should be cancelled due to insufficient participants (less than 10)
        $participantCount = DB::table('contest_entries')->where('contest_id', $contest->id)->count();
        
        if ($participantCount < 10) {
            $this->warn("  ⚠ Contest #{$contest->id} cancelled - less than 10 participants ({$participantCount} joined)");
            $this->cancelContestAndRefund($contest->id);
            return;
        }
        
        // Step 1: Calculate scores for all entries
        $this->calculateScores($contest->id, $session->market_type);
        
        // Step 2: Generate prize structure
        $this->generatePrizeStructure($contest);
        
        // Step 3: Assign ranks with tie-breaking
        $this->assignRanks($contest->id);
        
        // Step 4: SKIP auto prize distribution — admin will do it manually from Pending Prizes page
        // $this->distributePrizes($contest->id);
        
        // Step 5: Mark scores calculated (but NOT prizes_distributed)
        DB::table('contests')
            ->where('id', $contest->id)
            ->update(['is_calculated' => 1, 'updated_at' => now()]);
        
        $this->info("  ✓ Contest #{$contest->id} scores calculated (prizes pending manual distribution)");
    }

    private function cancelContestAndRefund($contestId)
    {
        DB::transaction(function() use ($contestId) {
            $contest = DB::table('contests')->where('id', $contestId)->first();
            $entryFee = floatval($contest->entry_fee ?? 0);
            
            $entries = DB::table('contest_entries')->where('contest_id', $contestId)->get();
            
            foreach ($entries as $entry) {
                DB::table('users')->where('id', $entry->user_id)->increment('deposit_balance', $entryFee);
                
                DB::table('transactions')->insert([
                    'user_id' => $entry->user_id,
                    'type' => 'deposit',
                    'amount' => $entryFee,
                    'status' => 'success',
                    'description' => "Contest #{$contestId} cancelled - Entry fee refunded",
                    'created_at' => now(),
                    'updated_at' => now()
                ]);
            }
            
            DB::table('contests')->where('id', $contestId)->update([
                'status' => 'cancelled',
                'updated_at' => now()
            ]);
            
            $this->info("  ✓ Refunded {$entries->count()} users with ₹{$entryFee} each");
        });
    }

    private function calculateScores($contestId, $marketType)
    {
        // Get session ID for this contest
        $contest = DB::table('contests')->where('id', $contestId)->first();
        $sessionId = $contest->league_session_id ?? null;

        // Get session asset prices (start and end)
        $sessionStartPrices = [];
        $sessionEndPrices = [];
        if ($sessionId) {
            $sessionStartPrices = DB::table('session_asset_prices')
                ->where('league_session_id', $sessionId)
                ->whereNotNull('start_price')
                ->pluck('start_price', 'asset_symbol')
                ->toArray();
            $sessionEndPrices = DB::table('session_asset_prices')
                ->where('league_session_id', $sessionId)
                ->whereNotNull('end_price')
                ->pluck('end_price', 'asset_symbol')
                ->toArray();
        }

        $entries = DB::table('contest_entries as ce')
            ->leftJoin('saved_baskets as sb', 'ce.basket_id', '=', 'sb.id')
            ->where('ce.contest_id', $contestId)
            ->select('ce.id', 'ce.starting_prices', 'sb.assets', 'sb.multipliers')
            ->get();

        foreach ($entries as $entry) {
            // Use entry's starting_prices if available, otherwise use session prices
            $startPrices = json_decode($entry->starting_prices ?? '[]', true) ?? [];
            if (empty($startPrices)) {
                $startPrices = $sessionStartPrices;
            }

            $assets = json_decode($entry->assets, true) ?? [];
            $multipliers = json_decode($entry->multipliers, true) ?? [];
            
            $totalScore = 0;

            foreach ($assets as $index => $asset) {
                $symbol = $asset['symbol'] ?? $asset['name'];
                $startPrice = $startPrices[$symbol] ?? 0;
                
                if ($startPrice <= 0) continue;
                
                // Get end price from session prices first, then fallback to API
                $endPrice = $sessionEndPrices[$symbol] ?? 0;
                if ($endPrice <= 0) {
                    $endPrice = $this->getEndPrice($contestId, $symbol, $marketType);
                }
                
                if ($endPrice <= 0) continue;
                
                // Step 1: Calculate price change %
                $priceChangePercent = (($endPrice - $startPrice) / $startPrice) * 100;
                
                // Step 2: Apply directional logic
                $prediction = $multipliers[$index]['prediction'] ?? 'UP';
                $multiplier = $multipliers[$index]['multiplier'] ?? 1;
                
                if ($prediction === 'DOWN') {
                    $directionalPercent = -$priceChangePercent;
                } else {
                    $directionalPercent = $priceChangePercent;
                }
                
                // Step 3: Apply multiplier
                $weightedPercent = $directionalPercent * $multiplier;
                
                // Step 4: Scale by 100 (convert to points)
                $points = round($weightedPercent, 2) * 100;
                
                $totalScore += $points;
            }

            // Update entry score
            DB::table('contest_entries')
                ->where('id', $entry->id)
                ->update(['total_score' => round($totalScore, 2)]);
        }
    }

    private function getEndPrice($contestId, $symbol, $marketType)
    {
        // Check if end price exists in contest_end_prices table
        $endPrice = DB::table('contest_end_prices')
            ->where('contest_id', $contestId)
            ->where('symbol', $symbol)
            ->value('end_price');
        
        if ($endPrice) {
            return $endPrice;
        }
        
        // Fetch from live API
        return $this->getCurrentPrice($symbol, $marketType);
    }

    private function getCurrentPrice($symbol, $marketType)
    {
        try {
            if ($marketType === 'crypto') {
                $response = Http::timeout(5)->withHeaders([
                    'X-CMC_PRO_API_KEY' => '0c5023c51b4247d3a0a139ee53ce5265'
                ])->get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', [
                    'symbol' => str_replace('-USD', '', $symbol)
                ]);

                if ($response->successful()) {
                    $data = $response->json();
                    $cleanSymbol = str_replace('-USD', '', $symbol);
                    return $data['data'][$cleanSymbol]['quote']['USD']['price'] ?? 0;
                }
            } else {
                $response = Http::timeout(5)->withHeaders([
                    'x-rapidapi-host' => 'indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com',
                    'x-rapidapi-key' => env('RAPIDAPI_KEY', 'b04e026debmsh974ec3b3aeb35d1p154a4ejsnc2f7176fb9b5')
                ])->get('https://indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com/v1/rapidapi/stock/quote', [
                    'tradingSymbol' => $symbol,
                    'exchange' => 'NSE'
                ]);

                if ($response->successful()) {
                    $data = $response->json();
                    return $data['lastPrice'] ?? 0;
                }
            }
        } catch (\Exception $e) {
            \Log::error("Error fetching price for {$symbol}: " . $e->getMessage());
        }
        
        return 0;
    }

    private function generatePrizeStructure($contest)
    {
        $actualParticipants = DB::table('contest_entries')
            ->where('contest_id', $contest->id)
            ->count();
        
        if ($actualParticipants == 0) return;
        
        $entryFee = floatval($contest->entry_fee ?? 50);
        $platformFeePercent = floatval($contest->platform_fee ?? 30);
        $winningPercent = floatval($contest->winning_percentage ?? 50);
        
        $totalPool = $actualParticipants * $entryFee;
        $platformFeeAmount = $totalPool * ($platformFeePercent / 100);
        $actualPrizePool = $totalPool - $platformFeeAmount;
        
        $actualWinnersCount = floor($actualParticipants * ($winningPercent / 100));
        if ($actualWinnersCount < 1 && $actualParticipants > 0) $actualWinnersCount = 1;
        
        $distribution = $this->getSimplePrizeTable($actualWinnersCount, $actualPrizePool);
        
        // Delete existing prizes
        DB::table('contest_performance_prizes')->where('contest_id', $contest->id)->delete();
        
        // Save new prize structure
        foreach ($distribution as $dist) {
            DB::table('contest_performance_prizes')->insert([
                'contest_id' => $contest->id,
                'rank_label' => $dist['label'],
                'rank_start' => $this->extractRankStart($dist['label']),
                'rank_end' => $this->extractRankEnd($dist['label']),
                'winners_count' => $dist['winners'],
                'percentage' => $dist['percent'],
                'prize_amount' => $dist['prize'],
                'per_winner_amount' => $dist['perWinner'],
                'total_pool' => $totalPool,
                'platform_fee' => $platformFeeAmount,
                'prize_pool' => $actualPrizePool,
                'total_participants' => $actualParticipants,
                'total_winners' => $actualWinnersCount,
                'created_at' => now(),
                'updated_at' => now()
            ]);
        }
    }

    private function getSimplePrizeTable($totalWinners, $prizePool)
    {
        if ($totalWinners <= 0 || $prizePool <= 0) return [];

        $prizeDistributionTable = [
            10 => [
                ['start' => 1, 'end' => 1, 'percent' => 30],
                ['start' => 2, 'end' => 2, 'percent' => 18],
                ['start' => 3, 'end' => 3, 'percent' => 11],
                ['start' => 4, 'end' => 5, 'percent' => 13.5],
                ['start' => 6, 'end' => 10, 'percent' => 27.5]
            ],
            25 => [
                ['start' => 1, 'end' => 1, 'percent' => 24],
                ['start' => 2, 'end' => 2, 'percent' => 14],
                ['start' => 3, 'end' => 3, 'percent' => 9],
                ['start' => 4, 'end' => 5, 'percent' => 12.375],
                ['start' => 6, 'end' => 10, 'percent' => 18.125],
                ['start' => 11, 'end' => 25, 'percent' => 22.5]
            ],
            50 => [
                ['start' => 1, 'end' => 1, 'percent' => 23],
                ['start' => 2, 'end' => 2, 'percent' => 13],
                ['start' => 3, 'end' => 3, 'percent' => 9],
                ['start' => 4, 'end' => 5, 'percent' => 8.1],
                ['start' => 6, 'end' => 10, 'percent' => 15],
                ['start' => 11, 'end' => 25, 'percent' => 16.4],
                ['start' => 26, 'end' => 50, 'percent' => 15.5]
            ],
            100 => [
                ['start' => 1, 'end' => 1, 'percent' => 18],
                ['start' => 2, 'end' => 2, 'percent' => 10],
                ['start' => 3, 'end' => 3, 'percent' => 8],
                ['start' => 4, 'end' => 5, 'percent' => 6.576],
                ['start' => 6, 'end' => 10, 'percent' => 10],
                ['start' => 11, 'end' => 25, 'percent' => 15.4],
                ['start' => 26, 'end' => 50, 'percent' => 16.524],
                ['start' => 51, 'end' => 100, 'percent' => 15.5]
            ]
        ];

        $keys = array_keys($prizeDistributionTable);
        sort($keys);
        
        // Find NEAREST key (closest to totalWinners)
        $chosenStructure = $keys[0];
        $minDiff = PHP_INT_MAX;
        foreach ($keys as $k) {
            $diff = abs($k - $totalWinners);
            if ($diff < $minDiff) {
                $minDiff = $diff;
                $chosenStructure = $k;
            }
        }
        
        $groups = $prizeDistributionTable[$chosenStructure];
        $distribution = [];
        
        foreach ($groups as $group) {
            if ($group['start'] > $totalWinners) continue;
            
            $end = min($group['end'], $totalWinners);
            $groupPrize = $prizePool * ($group['percent'] / 100);
            $numInGroup = $end - $group['start'] + 1;
            $perPersonPrize = $groupPrize / $numInGroup;
            
            $distribution[] = [
                'label' => "Ranks {$group['start']}-{$end}",
                'winners' => $numInGroup,
                'percent' => $group['percent'],
                'prize' => $groupPrize,
                'perWinner' => $perPersonPrize
            ];
            
            if ($end >= $totalWinners) break;
        }

        return $distribution;
    }

    private function assignRanks($contestId)
    {
        $entries = DB::table('contest_entries')
            ->where('contest_id', $contestId)
            ->orderBy('total_score', 'desc')
            ->orderBy('created_at', 'asc')
            ->get();

        $currentRank = 1;
        $previousScore = null;
        $sameScoreCount = 0;

        foreach ($entries as $index => $entry) {
            if ($previousScore !== null && $entry->total_score == $previousScore) {
                $sameScoreCount++;
            } else {
                $currentRank = $index + 1;
                $sameScoreCount = 0;
            }

            DB::table('contest_entries')
                ->where('id', $entry->id)
                ->update(['rank' => $currentRank]);

            $previousScore = $entry->total_score;
        }
    }

    private function distributePrizes($contestId)
    {
        // Use DB transaction with lock to prevent race conditions
        try {
            DB::transaction(function() use ($contestId) {
                // Lock the contest row to prevent concurrent processing
                $contest = DB::table('contests')
                    ->where('id', $contestId)
                    ->lockForUpdate()
                    ->first();
                
                // Check if prizes already distributed (with lock)
                $existingDistribution = DB::table('transactions')
                    ->where('contest_id', $contestId)
                    ->where('type', 'winnings')
                    ->lockForUpdate()
                    ->exists();
                
                if ($existingDistribution) {
                    $this->warn("  ⚠ Prizes already distributed for contest #{$contestId}, skipping...");
                    return;
                }
                
                // Get prize structure
                $prizes = DB::table('contest_performance_prizes')
                    ->where('contest_id', $contestId)
                    ->orderBy('rank_start')
                    ->get();

                if ($prizes->isEmpty()) {
                    $this->warn("  ⚠ No prize structure found for contest #{$contestId}");
                    return;
                }

                // Get all entries with ranks, grouped by user (only best rank per user)
                $entries = DB::table('contest_entries')
                    ->where('contest_id', $contestId)
                    ->whereNotNull('rank')
                    ->orderBy('rank')
                    ->orderBy('total_score', 'desc')
                    ->get()
                    ->groupBy('user_id')
                    ->map(function($userEntries) {
                        // Return only the best entry (lowest rank) for each user
                        return $userEntries->sortBy('rank')->first();
                    });

                foreach ($entries as $entry) {
                    $userRank = $entry->rank;
                    $userScore = floatval($entry->total_score ?? 0);
                    
                    // Find prize for this rank
                    $prizeAmount = 0;
                    foreach ($prizes as $prize) {
                        if ($userRank >= $prize->rank_start && $userRank <= $prize->rank_end) {
                            $prizeAmount = floatval($prize->per_winner_amount);
                            break;
                        }
                    }

                    // Skip if no prize for this rank
                    if ($prizeAmount <= 0) continue;
                    
                    // Floor the prize amount (remove decimals)
                    $prizeAmount = floor($prizeAmount);

                    // Credit wallet
                    DB::table('users')
                        ->where('id', $entry->user_id)
                        ->increment('winnings_balance', $prizeAmount);
                    
                    // Insert transaction
                    DB::table('transactions')->insert([
                        'user_id' => $entry->user_id,
                        'contest_id' => $contestId,
                        'type' => 'winnings',
                        'amount' => $prizeAmount,
                        'status' => 'success',
                        'description' => "Contest #{$contestId} - Rank {$userRank} Prize: ₹{$prizeAmount}",
                        'created_at' => now(),
                        'updated_at' => now()
                    ]);
                    
                    $this->info("    ✓ User #{$entry->user_id} - Rank {$userRank} - Prize: ₹{$prizeAmount}");
                }
            });
        } catch (\Exception $e) {
            $this->error("  ✗ Error distributing prizes for contest #{$contestId}: " . $e->getMessage());
        }
    }

    private function extractRankStart($label)
    {
        if (preg_match('/Ranks (\d+)-/', $label, $matches)) {
            return intval($matches[1]);
        }
        return 1;
    }

    private function extractRankEnd($label)
    {
        if (preg_match('/Ranks \d+-(\d+)/', $label, $matches)) {
            return intval($matches[1]);
        }
        return 1;
    }
}
