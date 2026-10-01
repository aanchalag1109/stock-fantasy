<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Services\RapidApiStockService;
use App\Services\CoinMarketCapService;

class CalculateController extends Controller
{
    public function saveStartPrices(Request $request)
    {
        try {
            $contestId = $request->input('contest_id');
            
            $contest = DB::table('contests')->where('id', $contestId)->first();
            if (!$contest) {
                return response()->json(['success' => false, 'error' => 'Contest not found'], 404);
            }

            // Get session assets
            $sessionAssets = DB::table('league_session_assets')
                ->where('league_session_id', $contest->league_session_id)
                ->get();
            
            DB::table('contest_start_prices')->where('contest_id', $contestId)->delete();
            
            $rapidApi = new RapidApiStockService();
            $coinMarketCap = new CoinMarketCapService();
            $cryptoData = $coinMarketCap->getCryptoListings(100);
            
            $savedCount = 0;
            foreach ($sessionAssets as $asset) {
                $symbol = $asset->asset_symbol;
                $price = 0;
                
                // Check if crypto
                if (strpos($symbol, '-USD') !== false) {
                    $cryptoSymbol = str_replace('-USD', '', $symbol);
                    $crypto = collect($cryptoData)->firstWhere('symbol', $cryptoSymbol);
                    if ($crypto) {
                        $price = $crypto['price'];
                    }
                } else {
                    // Stock
                    $stockData = $rapidApi->getStockQuote($symbol);
                    if ($stockData) {
                        $price = $stockData['lastPrice'] ?? 0;
                    }
                }
                
                if ($price > 0) {
                    DB::table('contest_start_prices')->insert([
                        'contest_id' => $contestId,
                        'symbol' => $symbol,
                        'start_price' => $price,
                        'timestamp' => now(),
                        'created_at' => now()
                    ]);
                    $savedCount++;
                }
            }

            return response()->json([
                'success' => true,
                'message' => 'Start prices saved successfully',
                'count' => $savedCount
            ]);
        } catch (\Exception $e) {
            Log::error('Save start prices error: ' . $e->getMessage());
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    public function saveEndPrices(Request $request)
    {
        try {
            $contestId = $request->input('contest_id');
            
            $contest = DB::table('contests')->where('id', $contestId)->first();
            if (!$contest) {
                return response()->json(['success' => false, 'error' => 'Contest not found'], 404);
            }

            // Get session assets
            $sessionAssets = DB::table('league_session_assets')
                ->where('league_session_id', $contest->league_session_id)
                ->get();
            
            DB::table('contest_end_prices')->where('contest_id', $contestId)->delete();
            
            $rapidApi = new RapidApiStockService();
            $coinMarketCap = new CoinMarketCapService();
            $cryptoData = $coinMarketCap->getCryptoListings(100);
            
            $savedCount = 0;
            foreach ($sessionAssets as $asset) {
                $symbol = $asset->asset_symbol;
                $price = 0;
                
                // Check if crypto
                if (strpos($symbol, '-USD') !== false) {
                    $cryptoSymbol = str_replace('-USD', '', $symbol);
                    $crypto = collect($cryptoData)->firstWhere('symbol', $cryptoSymbol);
                    if ($crypto) {
                        $price = $crypto['price'];
                    }
                } else {
                    // Stock
                    $stockData = $rapidApi->getStockQuote($symbol);
                    if ($stockData) {
                        $price = $stockData['lastPrice'] ?? 0;
                    }
                }
                
                if ($price > 0) {
                    DB::table('contest_end_prices')->insert([
                        'contest_id' => $contestId,
                        'symbol' => $symbol,
                        'end_price' => $price,
                        'timestamp' => now(),
                        'created_at' => now()
                    ]);
                    $savedCount++;
                }
            }

            return response()->json([
                'success' => true,
                'message' => 'End prices saved successfully',
                'count' => $savedCount
            ]);
        } catch (\Exception $e) {
            Log::error('Save end prices error: ' . $e->getMessage());
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    public function calculateResults(Request $request)
    {
        try {
            $contestId = $request->input('contest_id');
            $creditWallet = $request->input('credit_wallet', true);
            
            $contest = DB::table('contests')->where('id', $contestId)->first();
            if (!$contest) {
                return response()->json(['success' => false, 'error' => 'Contest not found'], 404);
            }

            // Get session-level prices
            $startPrices = DB::table('session_asset_prices')
                ->where('league_session_id', $contest->league_session_id)
                ->whereNotNull('start_price')
                ->get()
                ->keyBy('asset_symbol');

            $endPrices = DB::table('session_asset_prices')
                ->where('league_session_id', $contest->league_session_id)
                ->whereNotNull('end_price')
                ->get()
                ->keyBy('asset_symbol');

            if ($startPrices->isEmpty() || $endPrices->isEmpty()) {
                return response()->json([
                    'success' => false,
                    'error' => 'Start or end prices not available'
                ], 400);
            }

            $entries = DB::table('contest_entries')
                ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
                ->where('contest_entries.contest_id', $contestId)
                ->select('contest_entries.id', 'contest_entries.user_id', 'saved_baskets.assets', 'saved_baskets.multipliers')
                ->get();

            $resultsCalculated = 0;

            foreach ($entries as $entry) {
                $assets = json_decode($entry->assets ?? '[]', true);
                $multipliers = json_decode($entry->multipliers ?? '[]', true);
                $totalScore = 0;

                foreach ($assets as $index => $asset) {
                    $symbol = $asset['symbol'] ?? $asset['name'] ?? null;
                    if (!$symbol) continue;

                    $multiplierData = is_array($multipliers[$index] ?? 1) ? $multipliers[$index] : ['multiplier' => ($multipliers[$index] ?? 1), 'prediction' => 'UP'];
                    $multiplier = $multiplierData['multiplier'] ?? 1;
                    $prediction = strtoupper($multiplierData['prediction'] ?? 'UP');

                    if (isset($startPrices[$symbol]) && isset($endPrices[$symbol])) {
                        $startPrice = $startPrices[$symbol]->start_price;
                        $endPrice = $endPrices[$symbol]->end_price;

                        if ($startPrice > 0) {
                            $priceChangePercent = (($endPrice - $startPrice) / $startPrice) * 100;
                            
                            $directionalPercent = 0;
                            if ($prediction == 'UP') {
                                if ($priceChangePercent > 0) {
                                    $directionalPercent = $priceChangePercent;
                                } else {
                                    $directionalPercent = -abs($priceChangePercent);
                                }
                            } else {
                                if ($priceChangePercent < 0) {
                                    $directionalPercent = abs($priceChangePercent);
                                } else {
                                    $directionalPercent = -$priceChangePercent;
                                }
                            }
                            
                            $weightedPercent = $directionalPercent * $multiplier;
                            $points = round($weightedPercent, 2) * 100;
                            $totalScore += $points;
                        }
                    }
                }

                DB::table('contest_entries')->where('id', $entry->id)->update([
                    'total_score' => $totalScore,
                    'updated_at' => now()
                ]);

                $resultsCalculated++;
            }

            // Update ranks with tie-breaking logic
            $rankedEntries = DB::table('contest_entries')
                ->where('contest_id', $contestId)
                ->orderBy('total_score', 'desc')
                ->get();

            $currentRank = 1;
            $previousScore = null;
            $tiedCount = 0;

            foreach ($rankedEntries as $index => $entry) {
                if ($previousScore !== null && $entry->total_score == $previousScore) {
                    $tiedCount++;
                } else {
                    $currentRank = $index + 1;
                    $tiedCount = 0;
                }
                
                DB::table('contest_entries')
                    ->where('id', $entry->id)
                    ->update(['rank' => $currentRank]);
                
                $previousScore = $entry->total_score;
            }

            // Distribute prizes with tie-breaking
            $prizeDistribution = DB::table('contest_performance_prizes')
                ->where('contest_id', $contestId)
                ->orderBy('rank_start')
                ->get();

            // If no performance prizes saved, build them from prize_distribution JSON or dynamically
            if ($prizeDistribution->isEmpty()) {
                $this->ensurePrizeStructure($contest, $contestId);
                $prizeDistribution = DB::table('contest_performance_prizes')
                    ->where('contest_id', $contestId)
                    ->orderBy('rank_start')
                    ->get();
            }

            if ($creditWallet && $prizeDistribution->count() > 0) {
                // Check if already calculated
                if ($contest->is_calculated) {
                    Log::info("Contest {$contestId} already calculated, skipping prize distribution");
                } else {
                    $rankedEntries = DB::table('contest_entries')
                        ->where('contest_id', $contestId)
                        ->orderBy('total_score', 'desc')
                        ->get();

                    $processedRanks = [];
                
                foreach ($rankedEntries as $entry) {
                    $rank = $entry->rank;
                    
                    if (in_array($rank, $processedRanks)) continue;
                    
                    $processedRanks[] = $rank;
                    
                    $tiedUsers = $rankedEntries->where('rank', $rank);
                    $tiedCount = $tiedUsers->count();
                    
                    if ($tiedCount > 1) {
                        $totalPrize = 0;
                        for ($r = $rank; $r < $rank + $tiedCount; $r++) {
                            foreach ($prizeDistribution as $dist) {
                                if ($r >= $dist->rank_start && $r <= $dist->rank_end) {
                                    $totalPrize += $dist->per_winner_amount;
                                    break;
                                }
                            }
                        }
                        
                        $sharedPrize = round($totalPrize / $tiedCount, 2);
                        $sharedPrize = floor($sharedPrize); // Remove decimal
                        
                        foreach ($tiedUsers as $tiedUser) {
                            if ($sharedPrize > 0) {
                                $txId = 'CONTEST_' . $contestId . '_ENTRY_' . $tiedUser->id;
                                $exists = DB::table('transactions')->where('transaction_id', $txId)->exists();
                                
                                if (!$exists) {
                                    DB::table('users')
                                        ->where('id', $tiedUser->user_id)
                                        ->increment('winnings_balance', $sharedPrize);
                                    
                                    DB::table('transactions')->insert([
                                        'user_id' => $tiedUser->user_id,
                                        'type' => 'winnings',
                                        'amount' => floor($sharedPrize),
                                        'status' => 'success',
                                        'transaction_id' => $txId,
                                        'description' => 'Prize for ' . strtoupper($contest->category) . ' contest ' . $contestId . ', entry ' . $tiedUser->id,
                                        'created_at' => now(),
                                        'updated_at' => now()
                                    ]);
                                }
                            }
                        }
                    } else {
                        $prize = 0;
                        foreach ($prizeDistribution as $dist) {
                            if ($rank >= $dist->rank_start && $rank <= $dist->rank_end) {
                                $prize = $dist->per_winner_amount;
                                break;
                            }
                        }
                        
                        if ($prize > 0) {
                            $txId = 'CONTEST_' . $contestId . '_ENTRY_' . $entry->id;
                            $exists = DB::table('transactions')->where('transaction_id', $txId)->exists();
                            
                            if (!$exists) {
                                DB::table('users')
                                    ->where('id', $entry->user_id)
                                    ->increment('winnings_balance', floor($prize));
                                
                                DB::table('transactions')->insert([
                                    'user_id' => $entry->user_id,
                                    'type' => 'winnings',
                                    'amount' => floor($prize),
                                    'status' => 'success',
                                    'transaction_id' => $txId,
                                    'description' => 'Prize for ' . strtoupper($contest->category) . ' contest ' . $contestId . ', entry ' . $entry->id,
                                    'created_at' => now(),
                                    'updated_at' => now()
                                ]);
                            }
                        }
                    }
                }
                    
                    // Mark contest as calculated
                    DB::table('contests')->where('id', $contestId)->update(['is_calculated' => true]);
                }
            }

            return response()->json([
                'success' => true,
                'message' => "Results calculated and prizes distributed for {$resultsCalculated} entries",
                'entries_processed' => $resultsCalculated
            ]);
        } catch (\Exception $e) {
            Log::error('Calculate results error: ' . $e->getMessage());
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Ensure contest_performance_prizes table has prize structure.
     * Used when prizes weren't pre-saved (practice/guaranteed or missed dynamic).
     */
    private function ensurePrizeStructure($contest, $contestId): void
    {
        try {
            $isFixed = !empty($contest->is_fixed_prize) || in_array($contest->category, ['guaranteed', 'practice']);

            // ── Fixed (practice/guaranteed): use stored prize_distribution JSON ──
            if ($isFixed) {
                $dist = json_decode($contest->prize_distribution ?? '[]', true);
                if (!is_array($dist) || empty($dist)) return;

                $participants = DB::table('contest_entries')->where('contest_id', $contestId)->count();

                foreach ($dist as $row) {
                    $rankStart = intval($row['rank_start'] ?? 1);
                    $rankEnd   = intval($row['rank_end'] ?? $rankStart);
                    $perWinner = floatval($row['per_winner'] ?? $row['perWinner'] ?? $row['per_winner_amount'] ?? 0);
                    $winners   = intval($row['winners'] ?? $row['winners_count'] ?? ($rankEnd - $rankStart + 1));

                    DB::table('contest_performance_prizes')->insert([
                        'contest_id'        => $contestId,
                        'rank_label'        => $row['label'] ?? $row['rank_label'] ?? "Rank {$rankStart}-{$rankEnd}",
                        'rank_start'        => $rankStart,
                        'rank_end'          => $rankEnd,
                        'winners_count'     => $winners,
                        'percentage'        => floatval($row['percent'] ?? $row['percentage'] ?? 0),
                        'prize_amount'      => $perWinner * $winners,
                        'per_winner_amount' => $perWinner,
                        'prize_pool'        => floatval($contest->prize_pool ?? 0),
                        'total_participants'=> $participants,
                        'created_at'        => now(),
                        'updated_at'        => now(),
                    ]);
                }
                return;
            }

            // ── Dynamic (mega/equal): calculate from actual joined users ──
            $participants = DB::table('contest_entries')->where('contest_id', $contestId)->count();
            if ($participants <= 0) return;

            $entryFee    = floatval($contest->entry_fee ?? 0);
            $platformFee = floatval($contest->platform_fee ?? 0);
            $winPct      = floatval($contest->winning_percentage ?? 30);

            $totalPool   = $participants * $entryFee;
            $prizePool   = $totalPool - ($totalPool * $platformFee / 100);
            $winners     = max(1, floor($participants * $winPct / 100));

            if ($prizePool <= 0) return;

            $dist = $this->buildPrizeTable($winners, $prizePool, $contest->category);
            foreach ($dist as $row) {
                DB::table('contest_performance_prizes')->insert([
                    'contest_id'        => $contestId,
                    'rank_label'        => $row['label'],
                    'rank_start'        => $row['rank_start'],
                    'rank_end'          => $row['rank_end'],
                    'winners_count'     => $row['winners'],
                    'percentage'        => $row['percent'],
                    'prize_amount'      => $row['prize'],
                    'per_winner_amount' => $row['per_winner'],
                    'prize_pool'        => $prizePool,
                    'total_participants'=> $participants,
                    'total_winners'     => $winners,
                    'created_at'        => now(),
                    'updated_at'        => now(),
                ]);
            }
        } catch (\Exception $e) {
            Log::error("ensurePrizeStructure failed for contest {$contestId}: " . $e->getMessage());
        }
    }

    /**
     * Build prize table with nearest-tier + last-tier-extend logic
     */
    private function buildPrizeTable(int $totalWinners, float $prizePool, string $category = 'mega'): array
    {
        if ($totalWinners <= 0 || $prizePool <= 0) return [];

        if ($category === 'equal') {
            $perWinner = round($prizePool / $totalWinners, 2);
            return [[
                'label' => "Rank 1 to {$totalWinners}", 'rank_start' => 1, 'rank_end' => $totalWinners,
                'winners' => $totalWinners, 'percent' => 100, 'prize' => round($prizePool, 2), 'per_winner' => $perWinner,
            ]];
        }

        $tables = [
            10   => [[1,1,30],[2,2,18],[3,3,11],[4,5,13.5],[6,10,27.5]],
            25   => [[1,1,24],[2,2,14],[3,3,9],[4,5,12.375],[6,10,18.125],[11,25,22.5]],
            50   => [[1,1,23],[2,2,13],[3,3,9],[4,5,8.1],[6,10,15],[11,25,16.4],[26,50,15.5]],
            100  => [[1,1,18],[2,2,10],[3,3,8],[4,5,6.576],[6,10,10],[11,25,15.4],[26,50,16.524],[51,100,15.5]],
            250  => [[1,1,14],[2,2,9],[3,3,7],[4,5,5.169],[6,10,8.602],[11,25,13.323],[26,50,13.031],[51,100,13.375],[101,250,16.5]],
            500  => [[1,1,14],[2,2,9],[3,3,7],[4,5,3.1],[6,10,6.628],[11,25,10.576],[26,50,10.102],[51,100,12.469],[101,250,13.625],[251,500,13.5]],
            1000 => [[1,1,12],[2,2,8],[3,3,5],[4,5,2.399],[6,10,4.931],[11,25,9.11],[26,50,8.813],[51,100,10.418],[101,250,11.891],[251,500,12.188],[501,1000,15.25]],
            2500 => [[1,1,10],[2,2,7],[3,3,5],[4,5,1.8],[6,10,3.5],[11,25,7.386],[26,50,7.229],[51,100,8.972],[101,250,10.629],[251,500,11.172],[501,1000,12.562],[1001,2500,14.75]],
            5000 => [[1,1,10],[2,2,7],[3,3,5],[4,5,1.75],[6,10,3],[11,25,5.314],[26,50,5.355],[51,100,7.14],[101,250,8.853],[251,500,9.471],[501,1000,10.961],[1001,2500,12.281],[2501,5000,13.875]],
            10000 => [[1,1,10],[2,2,7],[3,3,5],[4,5,1.6],[6,10,2.049],[11,25,4.283],[26,50,4.31],[51,100,5.08],[101,500,8.774],[501,1000,10.365],[1001,2500,12.82],[2501,5000,12.094],[5001,10000,16.625]],
            25000 => [[1,1,8],[2,2,6],[3,3,4.5],[4,5,1.4],[6,10,1.7],[11,25,3.164],[26,50,3.422],[51,100,4.229],[101,500,6.262],[501,1000,7.339],[1001,5000,12.172],[5001,10000,12.562],[10001,25000,29.25]],
            50000 => [[1,1,8],[2,2,6],[3,3,4.5],[4,5,1.2],[6,10,1.7],[11,25,2.903],[26,50,3.043],[51,100,3.89],[101,500,6.187],[501,1000,6.916],[1001,5000,8.555],[5001,10000,10],[10001,25000,17.431],[25001,50000,19.675]],
            100000 => [[1,1,8],[2,2,6],[3,3,4.5],[4,5,1.052],[6,10,1.502],[11,25,2.737],[26,50,2.65],[51,100,3.533],[101,500,5.377],[501,1000,5.1],[1001,5000,7.893],[5001,10000,8.45],[10001,25000,11.031],[25001,50000,12.375],[50001,100000,19.8]],
            250000 => [[1,1,6.5],[2,2,5],[3,3,4],[4,5,1.076],[6,10,1.8],[11,25,2.53],[26,50,2.507],[51,100,3.11],[101,500,5],[501,1000,6],[1001,5000,7.075],[5001,10000,7.766],[10001,25000,8.355],[25001,100000,13.281],[100001,250000,26]],
            500000 => [[1,1,6.5],[2,2,5],[3,3,4],[4,5,1.005],[6,10,1.673],[11,25,2.831],[26,50,2.375],[51,100,2.9],[101,500,4.6],[501,1000,5.6],[1001,5000,6.788],[5001,10000,7.532],[10001,25000,7.734],[25001,100000,9.312],[100001,250000,12.75],[250001,500000,19.4]],
            1000000 => [[1,1,5.5],[2,2,4.2],[3,3,3.5],[4,5,0.941],[6,10,1.621],[11,25,2.194],[26,50,2.159],[51,100,2.812],[101,500,4.538],[501,1000,5.2],[1001,5000,6.555],[5001,10000,7.407],[10001,25000,7.709],[25001,100000,8.945],[100001,250000,11.594],[250001,500000,13.125],[500001,1000000,12]],
        ];

        $keys = array_keys($tables);
        sort($keys);
        $chosenKey = $keys[0];
        foreach ($keys as $k) { if ($k <= $totalWinners) $chosenKey = $k; }

        $tiers = $tables[$chosenKey];
        $dist  = [];

        foreach ($tiers as $idx => [$s, $e, $pct]) {
            if ($s > $totalWinners) break;
            $isLast = ($idx === count($tiers) - 1);
            $end    = $isLast ? $totalWinners : min($e, $totalWinners);
            if ($end < $s) break;
            $cnt    = $end - $s + 1;
            $prize  = round($prizePool * $pct / 100, 2);
            $dist[] = [
                'label' => "Rank {$s} to {$end}", 'rank_start' => $s, 'rank_end' => $end,
                'winners' => $cnt, 'percent' => $pct, 'prize' => $prize,
                'per_winner' => $cnt > 0 ? round($prize / $cnt, 2) : 0,
            ];
            if ($end >= $totalWinners) break;
        }

        $lastDist = end($dist);
        if ($lastDist && $lastDist['rank_end'] < $totalWinners) {
            $es = $lastDist['rank_end'] + 1; $ee = $totalWinners; $ec = $ee - $es + 1;
            $lp = end($tiers)[2]; $ep = round($prizePool * $lp / 100, 2);
            $dist[] = [
                'label' => "Rank {$es} to {$ee}", 'rank_start' => $es, 'rank_end' => $ee,
                'winners' => $ec, 'percent' => $lp, 'prize' => $ep,
                'per_winner' => $ec > 0 ? round($ep / $ec, 2) : 0,
            ];
        }

        return $dist;
    }
}
