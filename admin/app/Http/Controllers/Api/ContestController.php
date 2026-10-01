<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Models\User;
use Carbon\Carbon;
use App\Models\Contest;



class ContestController extends Controller
{








    public function getSessionDetails($sessionId)
    {
        try {
            $session = \DB::table('league_sessions')
                ->where('id', $sessionId)
                ->first();

            if (!$session) {
                return response()->json(['error' => 'Session not found'], 404);
            }

            return response()->json([
                'success' => true,
                'session' => $session
            ]);
        } catch (\Exception $e) {
            \Log::error('getSessionDetails error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }





public function getContest(Request $request, $id)
{
    $userId = $request->query('user_id');
    
    $contest = Contest::with(['leagueSession'])->find($id);

    if (!$contest) {
        return response()->json([
            'success' => false,
            'message' => 'Contest not found'
        ], 404);
    }

    // Check if calculation has started (end prices exist)
    $endPricesCount = DB::table('session_asset_prices')
        ->where('league_session_id', $contest->league_session_id)
        ->whereNotNull('end_price')
        ->count();
    $calculationStarted = $endPricesCount > 0;
    
    // Get start and end prices for calculation
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

    // Get ALL baskets (not grouped by user) - same as performance page
    $entries = DB::table('contest_entries')
        ->leftJoin('users', 'contest_entries.user_id', '=', 'users.id')
        ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
        ->where('contest_entries.contest_id', $id)
        ->select(
            'contest_entries.user_id',
            'contest_entries.basket_id',
            'contest_entries.total_score',
            'users.name as user_name',
            'saved_baskets.assets',
            'saved_baskets.multipliers',
            'saved_baskets.serial_no'
        )
        ->get();

    // Convert to array of baskets (not grouped)
    $participants = [];
    foreach ($entries as $entry) {
        $assets = json_decode($entry->assets ?? '[]', true);
        $multipliers = json_decode($entry->multipliers ?? '[]', true);
        
        // Calculate points for each asset
        $assetsWithPoints = [];
        $totalPoints = 0;
        foreach ($assets as $index => $asset) {
            $symbol = $asset['symbol'] ?? $asset['name'] ?? null;
            $multiplierData = is_array($multipliers[$index] ?? 1) 
                ? $multipliers[$index] 
                : ['multiplier' => ($multipliers[$index] ?? 1), 'prediction' => 'UP'];
            $multiplier = $multiplierData['multiplier'] ?? 1;
            $prediction = strtoupper($multiplierData['prediction'] ?? 'UP');
            
            $points = 0;
            if ($calculationStarted && $symbol && isset($startPrices[$symbol]) && isset($endPrices[$symbol])) {
                $startPrice = $startPrices[$symbol]->start_price;
                $endPrice = $endPrices[$symbol]->end_price;
                
                if ($startPrice > 0) {
                    $priceChangePercent = (($endPrice - $startPrice) / $startPrice) * 100;
                    
                    if ($prediction == 'UP') {
                        $directionalPercent = $priceChangePercent > 0 ? $priceChangePercent : -abs($priceChangePercent);
                    } else {
                        $directionalPercent = $priceChangePercent < 0 ? abs($priceChangePercent) : -$priceChangePercent;
                    }
                    
                    $weightedPercent = $directionalPercent * $multiplier;
                    $points = round($weightedPercent, 2) * 100;
                }
            }
            
            $totalPoints += $points;
            
            $assetsWithPoints[] = array_merge($asset, [
                'multiplier' => $multiplier,
                'prediction' => $prediction,
                'points' => $points
            ]);
        }
        
        $participants[] = [
            'user_id' => $entry->user_id,
            'user_name' => $entry->user_name ?? 'Unknown User',
            'basket_id' => $entry->basket_id,
            'serial_no' => $entry->serial_no,
            'total_score' => $calculationStarted ? floatval($entry->total_score ?? 0) : 0,
            'total_points' => round($totalPoints, 2),
            'assets' => $assetsWithPoints,
            'multipliers' => $multipliers
        ];
    }

    // Sort by total score only if calculation started
    if ($calculationStarted) {
        usort($participants, function($a, $b) {
            return $b['total_score'] <=> $a['total_score'];
        });
    }

    // Calculate ranks with tie-breaking only if calculation started
    $ranksWithTies = [];
    if ($calculationStarted) {
        $currentRank = 1;
        $previousScore = null;
        
        foreach ($participants as $index => $participant) {
            if ($previousScore !== null && $participant['total_score'] == $previousScore) {
                $ranksWithTies[$index] = $currentRank;
            } else {
                $currentRank = $index + 1;
                $ranksWithTies[$index] = $currentRank;
            }
            $previousScore = $participant['total_score'];
        }
    }

    // Get total joined users and calculate spots left
    $joinedUsersCount = count($entries);
    $maxParticipants = intval($contest->participants ?? 100);
    $spotsLeft = max(0, $maxParticipants - $joinedUsersCount);
    
    // ===== CORRECTED PRIZE POOL CALCULATION =====
    $sessionStatus = $contest->leagueSession->status ?? 'upcoming';
    $entryFee = floatval($contest->entry_fee ?? 0);
    $platformFeePercent = floatval($contest->platform_fee ?? 0);
    $isFlexible = !in_array(strtolower($contest->category), ['guaranteed', 'practice']) && $sessionStatus !== 'upcoming';
    $isFixed = in_array($contest->category, ['guaranteed', 'practice']) || !empty($contest->is_fixed_prize);
    
    // For fixed contests: always use stored prize_pool
    // For dynamic upcoming: use stored prize_pool
    // For dynamic live/completed: calculate from actual joins
    if ($isFixed) {
        $displayPrizePool = floatval($contest->prize_pool ?? 0);
        $totalPool = floatval($contest->total_pool ?? 0);
        $platformFeeAmount = floatval($contest->platform_fee_amount ?? 0);
    } elseif ($sessionStatus === 'upcoming') {
        $displayPrizePool = floatval($contest->prize_pool ?? 0);
        $totalPool = floatval($contest->total_pool ?? 0);
        $platformFeeAmount = floatval($contest->platform_fee_amount ?? 0);
    } else {
        // Dynamic live/completed
        $totalPool = $joinedUsersCount * $entryFee;
        $platformFeeAmount = ($totalPool * $platformFeePercent) / 100;
        $displayPrizePool = $totalPool - $platformFeeAmount;
    }
    
    $actualPrizePool = $displayPrizePool;

    // ===== GET PRIZES WITH RECALCULATION =====
    $prizes = [];
    $prizeDistribution = [];

    // Fixed contests (guaranteed/practice): ALWAYS use prize_distribution JSON directly
    // Dynamic contests: use contest_performance_prizes table (live/completed) or prize_distribution (upcoming)
    if ($isFixed) {
        // Fixed — use stored prize_distribution JSON, never recalculate
        $prizeDistJson = json_decode($contest->prize_distribution ?? '[]', true);
        if (is_array($prizeDistJson) && !empty($prizeDistJson)) {
            foreach ($prizeDistJson as $item) {
                // Support both old format (prize_percent) and new format (per_winner/percent)
                $perWinner = floatval(
                    $item['per_winner'] ?? $item['perWinner'] ??
                    $item['per_winner_amount'] ?? 0
                );
                $winnersCount = intval($item['winners'] ?? $item['winners_count'] ?? 1);
                $rankStart = intval($item['rank_start'] ?? 1);
                $rankEnd   = intval($item['rank_end'] ?? $rankStart);
                $label     = $item['label'] ?? $item['rank_label'] ?? "Rank {$rankStart} to {$rankEnd}";
                $percent   = floatval($item['percent'] ?? $item['percentage'] ?? $item['prize_percent'] ?? 0);
                $prizeAmt  = $perWinner * $winnersCount;

                $prizeDistribution[] = [
                    'rank_label'       => $label,
                    'rank_start'       => $rankStart,
                    'rank_end'         => $rankEnd,
                    'winners_count'    => $winnersCount,
                    'percentage'       => round($percent, 2),
                    'prize_amount'     => round($prizeAmt, 2),
                    'per_winner_amount'=> round($perWinner, 2),
                ];
            }
            $prizes = collect($prizeDistribution)->map(fn($item) => (object)[
                'rank_start'       => $item['rank_start'],
                'rank_end'         => $item['rank_end'],
                'per_winner_amount'=> $item['per_winner_amount'],
            ]);
        }
    } elseif ($calculationStarted || $sessionStatus === 'live') {
        // Dynamic live/completed — get from performance table
        $prizes = DB::table('contest_performance_prizes')
            ->where('contest_id', $id)
            ->orderBy('rank_start')
            ->get();

        if ($prizes->isNotEmpty()) {
            $dbPrizePool = floatval($prizes->first()->prize_pool ?? 0);
            // Recalculate if pool changed (new participants joined)
            if (!$isFixed && abs($dbPrizePool - $actualPrizePool) > 0.01) {
                $prizes = $this->recalculatePrizes($prizes, $actualPrizePool);
            }
            foreach ($prizes as $prize) {
                $prizeDistribution[] = [
                    'rank_label'       => $prize->rank_label,
                    'rank_start'       => intval($prize->rank_start),
                    'rank_end'         => intval($prize->rank_end),
                    'winners_count'    => intval($prize->winners_count),
                    'percentage'       => round(floatval($prize->percentage), 2),
                    'prize_amount'     => round(floatval($prize->prize_amount), 2),
                    'per_winner_amount'=> round(floatval($prize->per_winner_amount), 2),
                ];
            }
        } else {
            // Performance table empty — calculate on-the-fly from actual joined users
            $actualJoined  = DB::table('contest_entries')->where('contest_id', $id)->count();
            $actualWinners = max(1, floor($actualJoined * (floatval($contest->winning_percentage ?? 30) / 100)));

            if ($actualJoined > 0 && $actualPrizePool > 0) {
                $dist = $this->buildDynamicPrizeDistribution($actualWinners, $actualPrizePool, $contest->category);
                foreach ($dist as $row) {
                    $prizeDistribution[] = $row;
                }
            }
        }

        $prizes = collect($prizeDistribution)->map(fn($item) => (object)[
            'rank_start'       => $item['rank_start'],
            'rank_end'         => $item['rank_end'],
            'per_winner_amount'=> $item['per_winner_amount'],
        ]);
    } else {
        // Dynamic upcoming — use prize_distribution JSON, recalculate based on actual pool
        $prizeDistJson = json_decode($contest->prize_distribution ?? '[]', true);
        if (is_array($prizeDistJson) && !empty($prizeDistJson)) {
            foreach ($prizeDistJson as $item) {
                $percentage    = floatval($item['prize_percent'] ?? $item['percent'] ?? $item['percentage'] ?? 0);
                $winnersCount  = intval($item['winners'] ?? $item['winners_count'] ?? 1);
                $prizeAmount   = $actualPrizePool > 0 ? ($actualPrizePool * $percentage) / 100 : 0;
                $perWinnerAmt  = $winnersCount > 0 ? $prizeAmount / $winnersCount : 0;
                $rankStart     = intval($item['rank_start'] ?? 1);
                $rankEnd       = intval($item['rank_end'] ?? $rankStart);

                $prizeDistribution[] = [
                    'rank_label'       => $item['label'] ?? $item['rank_label'] ?? "Rank {$rankStart} to {$rankEnd}",
                    'rank_start'       => $rankStart,
                    'rank_end'         => $rankEnd,
                    'winners_count'    => $winnersCount,
                    'percentage'       => round($percentage, 2),
                    'prize_amount'     => round($prizeAmount, 2),
                    'per_winner_amount'=> round($perWinnerAmt, 2),
                ];
            }
            $prizes = collect($prizeDistribution)->map(fn($item) => (object)[
                'rank_start'       => $item['rank_start'],
                'rank_end'         => $item['rank_end'],
                'per_winner_amount'=> $item['per_winner_amount'],
            ]);
        }
    }

    // ===== APPLY PRIZES TO PARTICIPANTS =====
    foreach ($participants as $index => &$participant) {
        if ($calculationStarted) {
            $rank = $ranksWithTies[$index];
            $participant['rank'] = $rank;
            
            // Count tied baskets at this rank
            $tiedCount = 0;
            foreach ($ranksWithTies as $r) {
                if ($r == $rank) $tiedCount++;
            }
            
            $participant['is_tied'] = $tiedCount > 1;
            $participant['tied_count'] = $tiedCount;
            
            // Calculate prize with tie-breaking
            $prize = 0;
            if ($tiedCount > 1) {
                $totalPrize = 0;
                for ($r = $rank; $r < $rank + $tiedCount; $r++) {
                    foreach ($prizes as $prizeRecord) {
                        if ($r >= $prizeRecord->rank_start && $r <= $prizeRecord->rank_end) {
                            $totalPrize += floatval($prizeRecord->per_winner_amount);
                            break;
                        }
                    }
                }
                $prize = $totalPrize > 0 ? round($totalPrize / $tiedCount, 2) : 0;
            } else {
                foreach ($prizes as $prizeRecord) {
                    if ($rank >= $prizeRecord->rank_start && $rank <= $prizeRecord->rank_end) {
                        $prize = floatval($prizeRecord->per_winner_amount);
                        break;
                    }
                }
            }
            
            $participant['prize_amount'] = round($prize, 2);
        } else {
            $participant['rank'] = 0;
            $participant['is_tied'] = false;
            $participant['tied_count'] = 0;
            $participant['prize_amount'] = 0;
        }
    }
    unset($participant);

    // Check if user has joined this contest
    $userJoined = false;
    $userEntryCount = 0;
    if ($userId) {
        $userEntryCount = DB::table('contest_entries')
            ->where('contest_id', $id)
            ->where('user_id', $userId)
            ->count();
        $userJoined = $userEntryCount > 0;
    }

    // For upcoming session, show total_pool as prize_pool
    
    return response()->json([
        'contest' => [
            'id' => $contest->id,
            'category' => $contest->category,
            'prize_pool' => round($displayPrizePool, 2),
            'is_flexible_prize' => $isFlexible,
            'entry_fee' => $entryFee,
            'platform_fee_percent' => $platformFeePercent,
            'platform_fee_amount' => round($platformFeeAmount, 2),
            'total_pool' => round($totalPool, 2),
            'status' => $contest->status,
            'session_name' => $contest->leagueSession->name ?? 'Unknown Session',
            'session_status' => $sessionStatus,
            'prize_distribution' => $prizeDistribution,
            'max_entries_per_user' => intval($contest->max_entries_per_user ?? 1),
            'max_participants' => $maxParticipants,
            'joined_users' => $joinedUsersCount,
            'spots_left' => $spotsLeft,
            'winning_percentage' => floatval($contest->winning_percentage ?? 0),
            'calculation_started' => $calculationStarted
        ],
        'participants' => $participants,
        'user_joined' => $userJoined,
        'user_entry_count' => $userEntryCount,
        'remaining_entries' => max(0, intval($contest->max_entries_per_user ?? 1) - $userEntryCount),
        'unread_notifications' => NotificationController::getUnreadCount($userId),
    ]);
}

/**
 * Build dynamic prize distribution on-the-fly based on actual winners
 * Uses same tier table as admin form
 */
private function buildDynamicPrizeDistribution(int $totalWinners, float $prizePool, string $category = 'mega'): array
{
    if ($totalWinners <= 0 || $prizePool <= 0) return [];

    // Equal: single row
    if ($category === 'equal') {
        $perWinner = round($prizePool / $totalWinners, 2);
        return [[
            'rank_label'       => "Rank 1 to {$totalWinners}",
            'rank_start'       => 1,
            'rank_end'         => $totalWinners,
            'winners_count'    => $totalWinners,
            'percentage'       => 100,
            'prize_amount'     => round($prizePool, 2),
            'per_winner_amount'=> $perWinner,
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

    // Find NEAREST key (closest to totalWinners — can be smaller or larger)
    $keys = array_keys($tables);
    sort($keys);
    $chosenKey = $keys[0];
    $minDiff = PHP_INT_MAX;
    foreach ($keys as $k) {
        $diff = abs($k - $totalWinners);
        if ($diff < $minDiff) {
            $minDiff = $diff;
            $chosenKey = $k;
        }
    }

    $isHigher = $chosenKey > $totalWinners; // TRUE if chosen structure is BIGGER than actual winners
    $tiers = $tables[$chosenKey];
    $dist  = [];
    $previousPerWin = PHP_FLOAT_MAX;

    foreach ($tiers as $idx => [$s, $e, $pct]) {
        // Skip tiers that start beyond actual winners
        if ($s > $totalWinners) break;

        $isLast = ($idx === count($tiers) - 1);

        if ($isLast) {
            if ($isHigher) {
                $end = min($e, $totalWinners);
            } else {
                $end = $totalWinners;
            }
        } else {
            $end = min($e, $totalWinners);
        }

        if ($end < $s) break;

        $cnt    = $end - $s + 1;
        $prize  = round($prizePool * $pct / 100, 2);

        // Smart last slab: keep per_winner same as original structure when higher chosen
        if ($isLast || $end >= $totalWinners) {
            $originalLastTier = end($tiers);
            $structureWinners = $originalLastTier[1] - $originalLastTier[0] + 1;
            $divisor = $cnt <= $structureWinners ? $structureWinners : $cnt;
            $perWin = $divisor > 0 ? round($prize / $divisor, 2) : 0;

            // Safety clamp: last tier per_winner can't exceed previous tier
            if ($perWin > $previousPerWin) {
                $perWin = round($previousPerWin * 0.95, 2);
            }
        } else {
            $perWin = $cnt > 0 ? round($prize / $cnt, 2) : 0;
        }

        $dist[] = [
            'rank_label'       => "Rank {$s} to {$end}",
            'rank_start'       => $s,
            'rank_end'         => $end,
            'winners_count'    => $cnt,
            'percentage'       => round($pct, 4),
            'prize_amount'     => $prize,
            'per_winner_amount'=> $perWin,
        ];

        $previousPerWin = $perWin;
        if ($end >= $totalWinners) break;
    }

    // Extra winners beyond table (only if lower structure chosen)
    if (!$isHigher) {
        $lastDist = end($dist);
        if ($lastDist && $lastDist['rank_end'] < $totalWinners) {
            $es  = $lastDist['rank_end'] + 1;
            $ee  = $totalWinners;
            $ec  = $ee - $es + 1;
            $lp  = end($tiers)[2];
            $ep  = round($prizePool * $lp / 100, 2);
            $epw = $ec > 0 ? round($ep / $ec, 2) : 0;
            $dist[] = [
                'rank_label'       => "Rank {$es} to {$ee}",
                'rank_start'       => $es,
                'rank_end'         => $ee,
                'winners_count'    => $ec,
                'percentage'       => round($lp, 4),
                'prize_amount'     => $ep,
                'per_winner_amount'=> $epw,
            ];
        }
    }

    return $dist;
}

/**
 * Recalculate prizes based on new prize pool
 */
private function recalculatePrizes($prizes, $newPrizePool)
{
    return $prizes->map(function($prize) use ($newPrizePool) {
        $percentage = floatval($prize->percentage);
        $winnersCount = intval($prize->winners_count);
        
        $prizeAmount = ($newPrizePool * $percentage) / 100;
        $perWinnerAmount = $winnersCount > 0 ? $prizeAmount / $winnersCount : 0;
        
        $prize->prize_pool = $newPrizePool;
        $prize->prize_amount = $prizeAmount;
        $prize->per_winner_amount = $perWinnerAmount;
        
        return $prize;
    });
}


private function extractRankFromLabel($label, $isStart = true)
{
    preg_match('/Ranks? (\d+)(?:-(\d+))?/', $label, $matches);
    if ($isStart) {
        return isset($matches[1]) ? intval($matches[1]) : 1;
    } else {
        return isset($matches[2]) ? intval($matches[2]) : (isset($matches[1]) ? intval($matches[1]) : 1);
    }
}





//  public function getContest(Request $request, $id)
//     {
//         $userId = $request->query('user_id');
        
//         $contest = Contest::with(['leagueSession'])->find($id);

//         if (!$contest) {
//             return response()->json([
//                 'success' => false,
//                 'message' => 'Contest not found'
//             ], 404);
//         }

//         // Check if calculation has started (end prices exist)
//         $endPricesCount = DB::table('session_asset_prices')
//             ->where('league_session_id', $contest->league_session_id)
//             ->whereNotNull('end_price')
//             ->count();
//         $calculationStarted = $endPricesCount > 0;
        
//         // Get start and end prices for calculation
//         $startPrices = DB::table('session_asset_prices')
//             ->where('league_session_id', $contest->league_session_id)
//             ->whereNotNull('start_price')
//             ->get()
//             ->keyBy('asset_symbol');
            
//         $endPrices = DB::table('session_asset_prices')
//             ->where('league_session_id', $contest->league_session_id)
//             ->whereNotNull('end_price')
//             ->get()
//             ->keyBy('asset_symbol');

//         // Get ALL baskets (not grouped by user) - same as performance page
//         $entries = DB::table('contest_entries')
//             ->leftJoin('users', 'contest_entries.user_id', '=', 'users.id')
//             ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
//             ->where('contest_entries.contest_id', $id)
//             ->select(
//                 'contest_entries.user_id',
//                 'contest_entries.basket_id',
//                 'contest_entries.total_score',
//                 'users.name as user_name',
//                 'saved_baskets.assets',
//                 'saved_baskets.multipliers',
//                 'saved_baskets.serial_no'
//             )
//             ->get();

//         // Convert to array of baskets (not grouped)
//         $participants = [];
//         foreach ($entries as $entry) {
//             $assets = json_decode($entry->assets ?? '[]', true);
//             $multipliers = json_decode($entry->multipliers ?? '[]', true);
            
//             // Calculate points for each asset
//             $assetsWithPoints = [];
//             $totalPoints = 0;
//             foreach ($assets as $index => $asset) {
//                 $symbol = $asset['symbol'] ?? $asset['name'] ?? null;
//                 $multiplierData = is_array($multipliers[$index] ?? 1) ? $multipliers[$index] : ['multiplier' => ($multipliers[$index] ?? 1), 'prediction' => 'UP'];
//                 $multiplier = $multiplierData['multiplier'] ?? 1;
//                 $prediction = strtoupper($multiplierData['prediction'] ?? 'UP');
                
//                 $points = 0;
//                 if ($calculationStarted && $symbol && isset($startPrices[$symbol]) && isset($endPrices[$symbol])) {
//                     $startPrice = $startPrices[$symbol]->start_price;
//                     $endPrice = $endPrices[$symbol]->end_price;
                    
//                     if ($startPrice > 0) {
//                         $priceChangePercent = (($endPrice - $startPrice) / $startPrice) * 100;
                        
//                         if ($prediction == 'UP') {
//                             $directionalPercent = $priceChangePercent > 0 ? $priceChangePercent : -abs($priceChangePercent);
//                         } else {
//                             $directionalPercent = $priceChangePercent < 0 ? abs($priceChangePercent) : -$priceChangePercent;
//                         }
                        
//                         $weightedPercent = $directionalPercent * $multiplier;
//                         $points = round($weightedPercent, 2) * 100;
//                     }
//                 }
                
//                 $totalPoints += $points;
                
//                 $assetsWithPoints[] = array_merge($asset, [
//                     'multiplier' => $multiplier,
//                     'prediction' => $prediction,
//                     'points' => $points
//                 ]);
//             }
            
//             $participants[] = [
//                 'user_id' => $entry->user_id,
//                 'user_name' => $entry->user_name ?? 'Unknown User',
//                 'basket_id' => $entry->basket_id,
//                 'serial_no' => $entry->serial_no,
//                 'total_score' => $calculationStarted ? floatval($entry->total_score ?? 0) : 0,
//                 'total_points' => round($totalPoints, 2),
//                 'assets' => $assetsWithPoints,
//                 'multipliers' => $multipliers
//             ];
//         }

//         // Sort by total score only if calculation started
//         if ($calculationStarted) {
//             usort($participants, function($a, $b) {
//                 return $b['total_score'] <=> $a['total_score'];
//             });
//         }

//         // Calculate ranks with tie-breaking (same as performance page) only if calculation started
//         $ranksWithTies = [];
//         if ($calculationStarted) {
//             $currentRank = 1;
//             $previousScore = null;
            
//             foreach ($participants as $index => $participant) {
//                 if ($previousScore !== null && $participant['total_score'] == $previousScore) {
//                     $ranksWithTies[$index] = $currentRank;
//                 } else {
//                     $currentRank = $index + 1;
//                     $ranksWithTies[$index] = $currentRank;
//                 }
//                 $previousScore = $participant['total_score'];
//             }
//         }

//         // Get prize distribution for calculation
//         $prizes = [];
//         if ($calculationStarted) {
//             $prizes = DB::table('contest_performance_prizes')
//                 ->where('contest_id', $id)
//                 ->orderBy('rank_start')
//                 ->get();
            
//             // If no prizes in performance table, use prize_distribution JSON
//             if ($prizes->isEmpty() && $contest->prize_distribution) {
//                 $prizeDistJson = json_decode($contest->prize_distribution, true);
//                 if (is_array($prizeDistJson)) {
//                     $prizes = collect($prizeDistJson)->map(function($item) {
//                         return (object)[
//                             'rank_start' => $this->extractRankFromLabel($item['label'] ?? '', true),
//                             'rank_end' => $this->extractRankFromLabel($item['label'] ?? '', false),
//                             'per_winner_amount' => floatval($item['perWinner'] ?? 0)
//                         ];
//                     });
//                 }
//             }
//         }

//         // Apply prize and rank to each basket
//         foreach ($participants as $index => &$participant) {
//             if ($calculationStarted) {
//                 $rank = $ranksWithTies[$index];
//                 $participant['rank'] = $rank;
                
//                 // Count tied baskets at this rank
//                 $tiedCount = 0;
//                 foreach ($ranksWithTies as $r) {
//                     if ($r == $rank) $tiedCount++;
//                 }
                
//                 $participant['is_tied'] = $tiedCount > 1;
//                 $participant['tied_count'] = $tiedCount;
                
//                 // Calculate prize with tie-breaking
//                 $prize = 0;
//                 if ($tiedCount > 1) {
//                     $totalPrize = 0;
//                     for ($r = $rank; $r < $rank + $tiedCount; $r++) {
//                         foreach ($prizes as $prizeRecord) {
//                             if ($r >= $prizeRecord->rank_start && $r <= $prizeRecord->rank_end) {
//                                 $totalPrize += floatval($prizeRecord->per_winner_amount);
//                                 break;
//                             }
//                         }
//                     }
//                     $prize = $totalPrize > 0 ? round($totalPrize / $tiedCount, 2) : 0;
//                 } else {
//                     foreach ($prizes as $prizeRecord) {
//                         if ($rank >= $prizeRecord->rank_start && $rank <= $prizeRecord->rank_end) {
//                             $prize = floatval($prizeRecord->per_winner_amount);
//                             break;
//                         }
//                     }
//                 }
                
//                 $participant['prize_amount'] = round($prize, 2);
//             } else {
//                 // Calculation not started - set defaults
//                 $participant['rank'] = 0;
//                 $participant['is_tied'] = false;
//                 $participant['tied_count'] = 0;
//                 $participant['prize_amount'] = 0;
//             }
//         }
//         unset($participant);

//         // Check if user has joined this contest
//         $userJoined = false;
//         $userEntryCount = 0;
//         if ($userId) {
//             $userEntryCount = DB::table('contest_entries')
//                 ->where('contest_id', $id)
//                 ->where('user_id', $userId)
//                 ->count();
//             $userJoined = $userEntryCount > 0;
//         }

//         // Get total joined users and calculate spots left
//         $joinedUsersCount = DB::table('contest_entries')
//             ->where('contest_id', $id)
//             ->count();
//         $maxParticipants = intval($contest->participants ?? 100);
//         $spotsLeft = max(0, $maxParticipants - $joinedUsersCount);
        
//         // Calculate dynamic prize pool for flexible contests
//         $prizePool = floatval($contest->prize_pool);
//         $sessionStatus = $contest->leagueSession->status ?? 'upcoming';
//         $isFlexible = in_array(strtolower($contest->category), ['flexible', 'mega', 'equal']);
//         if ($isFlexible && $joinedUsersCount > 0) {
//             $entryFee = floatval($contest->entry_fee ?? 0);
//             $platformFeePercent = floatval($contest->platform_fee ?? 0);
//             $totalPool = $joinedUsersCount * $entryFee;
//             $platformFeeAmount = ($totalPool * $platformFeePercent) / 100;
//             $prizePool = $totalPool - $platformFeeAmount;
//         }

//         // Get prize distribution
//         $prizeDistribution = [];
//         if ($contest->leagueSession && in_array($contest->leagueSession->status, ['live', 'completed'])) {
//             $prizes = DB::table('contest_performance_prizes')
//                 ->where('contest_id', $id)
//                 ->orderBy('rank_start')
//                 ->get();
            
//             if ($prizes->isNotEmpty()) {
//                 // Use per_winner_amount directly from database (already calculated correctly)
//                 foreach ($prizes as $prize) {
//                     $prizeDistribution[] = [
//                         'rank_label' => $prize->rank_label,
//                         'rank_start' => $prize->rank_start,
//                         'rank_end' => $prize->rank_end,
//                         'winners_count' => $prize->winners_count,
//                         'percentage' => floatval($prize->percentage),
//                         'prize_amount' => floatval($prize->prize_amount),
//                         'per_winner_amount' => floatval($prize->per_winner_amount)
//                     ];
//                 }
//             }
//             // If no prizes in database for live/completed, return empty array (don't fallback to JSON)
//         } else {
//             // For upcoming contests, use prize_distribution JSON and format it properly
//             $prizeDistJson = json_decode($contest->prize_distribution ?? '[]', true);
//             if (is_array($prizeDistJson)) {
//                 foreach ($prizeDistJson as $item) {
//                     $prizeDistribution[] = [
//                         'rank_start' => $item['rank_start'] ?? 1,
//                         'rank_end' => $item['rank_end'] ?? 1,
//                         'winners_count' => $item['winners'] ?? 1,
//                         'percentage' => floatval($item['prize_percent'] ?? 0),
//                         'per_winner_amount' => floatval($item['prize_per_user'] ?? 0)
//                     ];
//                 }
//             }
//         }

//         return response()->json([
//             'contest' => [
//                 'id' => $contest->id,
//                 'category' => $contest->category,
//                 'prize_pool' => $prizePool,
//                 'is_flexible_prize' => $isFlexible,
//                 'entry_fee' => floatval($contest->entry_fee),
//                 'status' => $contest->status,
//                 'session_name' => $contest->leagueSession->name ?? 'Unknown Session',
//                 'session_status' => $contest->leagueSession->status ?? 'upcoming',
//                 'prize_distribution' => $prizeDistribution,
//                 'max_entries_per_user' => intval($contest->max_entries_per_user ?? 1),
//                 'max_participants' => $maxParticipants,
//                 'joined_users' => $joinedUsersCount,
//                 'spots_left' => $spotsLeft,
//                 'winning_percentage' => floatval($contest->winning_percentage ?? 0),
//                 'calculation_started' => $calculationStarted
//             ],
//             'participants' => $participants,
//             'user_joined' => $userJoined,
//             'user_entry_count' => $userEntryCount,
//             'remaining_entries' => max(0, intval($contest->max_entries_per_user ?? 1) - $userEntryCount),
//             'unread_notifications' => NotificationController::getUnreadCount($userId),
//         ]);
//     }

   






     public function getUserSessions(Request $request)
    {
        try {
            // This method currently fetches all sessions and manually adds empty assets/entries_count
            // If the intent is to show sessions a user *has joined*, this query needs to be adjusted
            // to join with saved_baskets and filter by user_id.
            $sessions = DB::table('league_sessions') // Corrected: use DB facade
                ->leftJoin('contests', 'league_sessions.id', '=', 'contests.league_session_id')
                ->select(
                    'league_sessions.*',
                    'contests.id as contest_id',
                    'contests.entry_fee',
                    'contests.prize_pool',
                    'contests.category as contest_category'
                )
                ->orderBy('league_sessions.start_time', 'desc')
                ->get();

            $sessions = $sessions->map(function($session) {
                $session = (array) $session;
                $session['assets'] = []; // Placeholder, would require another join/query
                $session['entries_count'] = 0; // Placeholder
                $session['joined_at'] = null; // Placeholder
                $session['entry_fee'] = floatval($session['entry_fee'] ?? 0);
                $session['prize_pool'] = floatval($session['prize_pool'] ?? 0);
                return $session;
            });

            return response()->json(['sessions' => $sessions]);
        } catch (\Exception $e) {
            Log::error('Error fetching user sessions: ' . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function getActiveSession(Request $request)
    {
        try {
            $session = DB::table('league_sessions') // Corrected: use DB facade
                ->where('status', 'live')
                ->orderBy('start_time', 'desc')
                ->first();

            if (!$session) {
                return response()->json(['error' => 'No active session found'], 404);
            }

            // Convert to array and fix data types
            $sessionData = [
                'id' => (int) $session->id,
                'name' => $session->name,
                'market_type' => $session->market_type,
                'max_stocks' => (int) $session->max_stocks,
                'user_joining_start_time' => $session->user_joining_start_time,
                'start_time' => $session->start_time,
                'end_time' => $session->end_time,
                'status' => $session->status,
                'active' => (bool) $session->active, // Ensure boolean type
                'stocks' => json_decode($session->stocks, true) ?? [], // Decode and handle null
                'cryptos' => json_decode($session->cryptos, true) ?? [], // Decode and handle null
                'created_at' => $session->created_at,
                'updated_at' => $session->updated_at
            ];

            return response()->json(['session' => $sessionData]);
        } catch (\Exception $e) {
            Log::error('Error fetching active session: ' . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function getSessionAssets($sessionId)
    {
        try {
            $assets = DB::table('league_session_assets') // Corrected: use DB facade
                ->leftJoin('assets', 'league_session_assets.asset_symbol', '=', 'assets.symbol')
                ->leftJoin('market_type_categories', 'league_session_assets.category_id', '=', 'market_type_categories.id')
                ->where('league_session_assets.league_session_id', $sessionId)
                ->select(
                    'assets.symbol',
                    'assets.name',
                    'assets.type',
                    'market_type_categories.name as category_name'
                )
                ->get();

            return response()->json(['assets' => $assets]);
        } catch (\Exception $e) {
            Log::error('Error fetching session assets for session ' . $sessionId . ': ' . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function getSessionAssetsGrouped($sessionId)
    {
        try {
            $assets = DB::table('league_session_assets')
                ->join('market_type_categories', 'league_session_assets.category_id', '=', 'market_type_categories.id')
                ->where('league_session_assets.league_session_id', $sessionId)
                ->select(
                    'league_session_assets.asset_symbol as symbol',
                    'league_session_assets.asset_symbol as name',
                    'market_type_categories.name as category_name',
                    'market_type_categories.id as category_id'
                )
                ->get();

            return response()->json(['assets' => $assets]);
        } catch (\Exception $e) {
            Log::error('Error: ' . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }



 public function getUserContests(Request $request)
    {
        try {
            $userId = $request->query('user_id');
            $sessionId = $request->query('session_id');

            if (!$userId) {
                return response()->json([
                    'success' => false,
                    'error' => 'user_id is required'
                ], 400);
            }

            $query = DB::table('contest_entries')
                ->leftJoin('contests', 'contest_entries.contest_id', '=', 'contests.id')
                ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
                ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
                ->select(
                    'contest_entries.id',
                    'contest_entries.user_id',
                    'contest_entries.contest_id',
                    'contest_entries.basket_id',
                    'contest_entries.session_id',
                    'contest_entries.total_score',
                    'contest_entries.rank',
                    'contest_entries.starting_prices',
                    'contest_entries.created_at as entry_created_at',
                    'saved_baskets.assets',
                    'saved_baskets.multipliers',
                    'contests.category',
                    'contests.status as contest_status',
                    'contests.prize_pool',
                    'contests.entry_fee',
                    'contests.platform_fee',
                    'league_sessions.status as session_status',
                    'contests.participants as max_participants_in_contest',
                    'league_sessions.name as session_name',
                    'league_sessions.id as league_session_id'
                )
                ->where('contest_entries.user_id', $userId);
            
            if ($sessionId) {
                $query->where('contest_entries.session_id', $sessionId);
            }
            
            $entries = $query->orderBy('contest_entries.created_at', 'desc')->get();

            // Group entries by session_id first, then by contest_id
            $sessionsMap = [];
            foreach ($entries as $entry) {
                $sessionId = $entry->league_session_id;
                $contestId = $entry->contest_id;
                
                // Initialize session if not exists
                if (!isset($sessionsMap[$sessionId])) {
                    $sessionsMap[$sessionId] = [
                        'session_id' => $sessionId,
                        'session_name' => $entry->session_name,
                        'session_status' => $entry->session_status,
                        'contests' => []
                    ];
                }
                
                // Initialize contest if not exists in this session
                if (!isset($sessionsMap[$sessionId]['contests'][$contestId])) {
                    $joinedUsers = DB::table('contest_entries')
                        ->where('contest_id', $contestId)
                        ->count();
                    
                    $maxParticipants = intval($entry->max_participants_in_contest ?? 0);
                    
                    // Calculate dynamic prize pool for flexible contests
                    $prizePool = floatval($entry->prize_pool ?? 0);
                    $category = strtolower(trim($entry->category ?? ''));
                    $sessionStatus = $entry->session_status ?? 'upcoming';
                    $isFlexible = false;
                    
                    if (in_array($category, ['flexible', 'mega', 'equal']) && in_array($sessionStatus, ['live', 'completed'])) {
                        $isFlexible = true;
                        $entryFee = floatval($entry->entry_fee ?? 0);
                        $platformFeePercent = floatval($entry->platform_fee ?? 0);
                        $totalPool = $joinedUsers * $entryFee;
                        $platformFeeAmount = ($totalPool * $platformFeePercent) / 100;
                        $prizePool = $totalPool - $platformFeeAmount;
                    }
                    
                    $sessionsMap[$sessionId]['contests'][$contestId] = [
                        'contest_id' => $contestId,
                        'category' => $entry->category,
                        'prize_pool' => $prizePool,
                        'is_flexible_prize' => $isFlexible,
                        'entry_fee' => floatval($entry->entry_fee ?? 0),
                        'status' => $entry->contest_status,
                        'total_spots' => $maxParticipants,
                        'spots_joined' => $joinedUsers,
                        'spots_available' => max(0, $maxParticipants - $joinedUsers),
                        'baskets' => []
                    ];
                }
                
                // Get start and end prices for this contest from session
                $contest = \DB::table('contests')->where('id', $contestId)->first();
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
                    
                $calculationStarted = $endPrices->count() > 0;
                
                // Calculate points for each asset
                $assets = json_decode($entry->assets ?? '[]', true);
                $multipliers = json_decode($entry->multipliers ?? '[]', true);
                $assetsWithPoints = [];
                $totalPoints = 0;
                
                foreach ($assets as $index => $asset) {
                    $symbol = $asset['symbol'] ?? $asset['name'] ?? null;
                    $multiplierData = is_array($multipliers[$index] ?? 1) ? $multipliers[$index] : ['multiplier' => ($multipliers[$index] ?? 1), 'prediction' => 'UP'];
                    $multiplier = $multiplierData['multiplier'] ?? 1;
                    $prediction = strtoupper($multiplierData['prediction'] ?? 'UP');
                    
                    $points = 0;
                    if ($calculationStarted && $symbol && isset($startPrices[$symbol]) && isset($endPrices[$symbol])) {
                        $startPrice = $startPrices[$symbol]->start_price;
                        $endPrice = $endPrices[$symbol]->end_price;
                        
                        if ($startPrice > 0) {
                            $priceChangePercent = (($endPrice - $startPrice) / $startPrice) * 100;
                            
                            if ($prediction == 'UP') {
                                $directionalPercent = $priceChangePercent > 0 ? $priceChangePercent : -abs($priceChangePercent);
                            } else {
                                $directionalPercent = $priceChangePercent < 0 ? abs($priceChangePercent) : -$priceChangePercent;
                            }
                            
                            $weightedPercent = $directionalPercent * $multiplier;
                            $points = round($weightedPercent, 2) * 100;
                        }
                    }
                    
                    $totalPoints += $points;
                    
                    $assetsWithPoints[] = array_merge($asset, [
                        'multiplier' => $multiplier,
                        'prediction' => $prediction,
                        'points' => $points
                    ]);
                }
                
                // Add basket to the contest
                $sessionsMap[$sessionId]['contests'][$contestId]['baskets'][] = [
                    'entry_id' => $entry->id,
                    'basket_id' => $entry->basket_id,
                    'serial_no' => DB::table('saved_baskets')->where('id', $entry->basket_id)->value('serial_no'),
                    'assets' => $assetsWithPoints,
                    'multipliers' => $multipliers,
                    'starting_prices' => json_decode($entry->starting_prices ?? '[]', true),
                    'total_score' => floatval($entry->total_score ?? 0),
                    'total_points' => round($totalPoints, 2),
                    'rank' => $entry->rank,
                    'entry_created_at' => $entry->entry_created_at
                ];
            }

            // Convert contests associative arrays to indexed arrays
            foreach ($sessionsMap as &$session) {
                $session['contests'] = array_values($session['contests']);
            }

            // Filter out sessions with null session_id
            $sessions = array_values(array_filter($sessionsMap, function($session) {
                return $session['session_id'] !== null;
            }));

            return response()->json([
                'success' => true,
                'sessions' => $sessions,
                'total' => count($sessions),
                'unread_notifications' => NotificationController::getUnreadCount($userId),
            ]);

        } catch (\Exception $e) {
            Log::error('Error fetching user contests: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }




  public function contestsBySession($sessionId) {
        try {
            // Get session data
            $session = DB::table('league_sessions')
                ->where('id', $sessionId)
                ->first();

            if (!$session) {
                return response()->json(['error' => 'Session not found'], 404);
            }

            $shouldRedirect = in_array($session->status, ['live', 'completed']);

            // Pinned contests pehle, phir prize pool descending
            $contests = DB::table('contests')
                ->where('league_session_id', $sessionId)
                ->whereNotIn('status', ['cancelled'])
                ->orderByDesc('is_pinned')   // pinned = 1 pehle
                ->orderBy('pin_order')        // pin_order ascending
                ->orderByRaw('CAST(prize_pool AS DECIMAL(15,2)) DESC')
                ->get();

            $contests = $contests->map(function ($contest) use ($session) {
                $contest     = (array) $contest;
                $joinedCount = DB::table('contest_entries')->where('contest_id', $contest['id'])->count();
                $contest['joined_count'] = $joinedCount;

                $entryFee           = floatval($contest['entry_fee'] ?? 0);
                $platformFeePercent = floatval($contest['platform_fee'] ?? 0);
                $isFixed            = !empty($contest['is_fixed_prize']) || in_array($contest['category'], ['guaranteed', 'practice']);

                // Prize pool calculation
                if ($isFixed) {
                    // Fixed/Guaranteed/Practice: ALWAYS use stored prize_pool — never recalculate
                    $prizePool = floatval($contest['prize_pool'] ?? 0);
                } elseif ($session->status === 'upcoming') {
                    // Dynamic upcoming: use stored prize_pool
                    $prizePool = floatval($contest['prize_pool'] ?? 0);
                } else {
                    // Dynamic live/completed: calculate from actual joins
                    $totalPool         = $joinedCount * $entryFee;
                    $platformFeeAmount = ($totalPool * $platformFeePercent) / 100;
                    $prizePool         = $totalPool - $platformFeeAmount;
                }

                $contest['prize_pool']        = round($prizePool, 2);
                $contest['is_flexible_prize'] = !$isFixed;  // Fixed = NOT flexible
                $contest['is_fixed_prize']    = $isFixed;
                $contest['entry_fee']         = $entryFee;
                $contest['is_pinned']         = !empty($contest['is_pinned']);

                // Label for pinned/guaranteed/practice
                $contest['badge'] = null;
                if (!empty($contest['is_pinned'])) {
                    $contest['badge'] = 'Featured';
                } elseif ($contest['category'] === 'guaranteed') {
                    $contest['badge'] = 'Guaranteed';
                } elseif ($contest['category'] === 'practice') {
                    $contest['badge'] = 'Practice';
                }

                // First prize from prize_distribution
                $contest['first_prize'] = 0;
                if (!empty($contest['prize_distribution'])) {
                    $pd = json_decode($contest['prize_distribution'], true);
                    if (is_array($pd) && !empty($pd)) {
                        $first = reset($pd);
                        $contest['first_prize'] = round(floatval($first['per_winner'] ?? $first['perWinner'] ?? 0), 2);
                    }
                }

                // For live dynamic contests: calculate first_prize from actual joined users
                if (!$isFixed && in_array($session->status, ['live', 'completed']) && $prizePool > 0) {
                    $actualWinners = max(1, floor($joinedCount * (floatval($contest['winning_percentage'] ?? 30) / 100)));
                    if ($actualWinners > 0) {
                        $dist = $this->buildDynamicPrizeDistribution($actualWinners, $prizePool, $contest['category']);
                        if (!empty($dist)) {
                            $contest['first_prize'] = round($dist[0]['per_winner_amount'] ?? 0, 2);
                        }
                    }
                }

                return $contest;
            });

            return response()->json([
                'contests' => $contests,
                'session'  => [
                    'id'         => (int) $session->id,
                    'name'       => $session->name,
                    'start_time' => $session->start_time,
                    'end_time'   => $session->end_time,
                    'status'     => $session->status,
                ],
                'redirect_to_home'     => $shouldRedirect,
                'unread_notifications' => NotificationController::getUnreadCount(),
            ]);
        } catch (\Exception $e) {
            Log::error('Error fetching contests by session: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to fetch contests'], 500);
        }
    }

    public function myContestsBySession($sessionId) {
        try {
            $session = DB::table('league_sessions')->where('id', $sessionId)->first();
            if (!$session) {
                return response()->json(['error' => 'Session not found'], 404);
            }

            $contests = DB::table('contests')
                ->where('league_session_id', $sessionId)
                ->orderByRaw('CAST(prize_pool AS DECIMAL(10,2)) DESC')
                ->get();

            $contests = $contests->map(function($contest) {
                $contest = (array) $contest;
                $joinedCount = DB::table('contest_entries')->where('contest_id', $contest['id'])->count();
                $contest['joined_count'] = $joinedCount;
                $contest['status'] = $contest['status'] ?? 'active';
                
                $prizePool = floatval($contest['prize_pool']);
                $isFlexible = in_array(strtolower($contest['category']), ['flexible', 'mega', 'equal']);
                if ($isFlexible) {
                    $entryFee = floatval($contest['entry_fee'] ?? 0);
                    $platformFeePercent = floatval($contest['platform_fee'] ?? 0);
                    $totalPool = $joinedCount * $entryFee;
                    $platformFeeAmount = ($totalPool * $platformFeePercent) / 100;
                    $prizePool = $totalPool - $platformFeeAmount;
                }
                
                $contest['prize_pool'] = $prizePool;
                $contest['is_flexible_prize'] = $isFlexible;
                $contest['entry_fee'] = floatval($contest['entry_fee']);
                
                $contest['first_prize'] = 0;
                if (!empty($contest['prize_distribution'])) {
                    $prizeDistribution = json_decode($contest['prize_distribution'], true);
                    if (is_array($prizeDistribution) && !empty($prizeDistribution)) {
                        $firstPrize = reset($prizeDistribution);
                        $contest['first_prize'] = round(floatval($firstPrize['perWinner'] ?? 0), 2);
                    }
                }
                
                return $contest;
            });

            return response()->json([
                'contests' => $contests,
                'session' => [
                    'id' => (int) $session->id,
                    'name' => $session->name,
                    'start_time' => $session->start_time,
                    'end_time' => $session->end_time,
                    'status' => $session->status
                ]
            ]);
        } catch (\Exception $e) {
            Log::error('Error fetching my contests by session: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to fetch contests'], 500);
        }
    }
















    public function calculateResults(Request $request): JsonResponse
    {
        try {
            $contestId = $request->input('contest_id');
            if (!$contestId) {
                return response()->json(['success' => false, 'error' => 'Contest ID required'], 400);
            }
            
            $contest = DB::table('contests')->where('id', $contestId)->first();
            if (!$contest) {
                return response()->json(['success' => false, 'error' => 'Contest not found'], 404);
            }
            
            $startPrices = json_decode($contest->start_prices ?? '{}', true);
            $endPrices = json_decode($contest->end_prices ?? '{}', true);
            
            if (empty($startPrices) || empty($endPrices)) {
                return response()->json(['success' => false, 'error' => 'Start or end prices not available'], 400);
            }
            
            $entries = DB::table('contest_entries')
                ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
                ->where('contest_entries.contest_id', $contestId)
                ->select('contest_entries.id', 'saved_baskets.assets', 'saved_baskets.multipliers')
                ->get();
            
            $resultsCalculated = 0;
            
            foreach ($entries as $entry) {
                $assets = json_decode($entry->assets ?? '[]', true);
                $multipliers = json_decode($entry->multipliers ?? '[]', true);
                $totalScore = 0;
                
                foreach ($assets as $index => $asset) {
                    $symbol = $asset['symbol'] ?? $asset['name'];
                    $multiplierData = $multipliers[$index] ?? ['multiplier' => 1, 'prediction' => 'UP'];
                    $multiplier = is_array($multiplierData) ? ($multiplierData['multiplier'] ?? 1) : $multiplierData;
                    $prediction = is_array($multiplierData) ? ($multiplierData['prediction'] ?? 'UP') : 'UP';
                    
                    if (isset($startPrices[$symbol]) && isset($endPrices[$symbol])) {
                        $startPrice = $startPrices[$symbol]['price'] ?? 0;
                        $endPrice = $endPrices[$symbol]['price'] ?? 0;
                        
                        if ($startPrice > 0) {
                            $priceChangePercent = (($endPrice - $startPrice) / $startPrice) * 100;
                            $actualDirection = $priceChangePercent >= 0 ? 'UP' : 'DOWN';
                            $directionalPercent = ($prediction === $actualDirection) ? $priceChangePercent : -abs($priceChangePercent);
                            $weightedPercent = $directionalPercent * $multiplier;
                            $points = round($weightedPercent, 2) * 100;
                            $totalScore += $points;
                        }
                    }
                }
                
                DB::table('contest_entries')->where('id', $entry->id)->update([
                    'total_score' => $totalScore,
                    'results_calculated_at' => now()
                ]);
                
                $resultsCalculated++;
            }
            
            return response()->json([
                'success' => true,
                'message' => "Results calculated for {$resultsCalculated} entries",
                'entries_processed' => $resultsCalculated
            ]);
            
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    public function contests(): JsonResponse
    {
        try {
            $contests = DB::table('contests')
                ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
                ->select('contests.*', 'league_sessions.name as session_name')
                ->orderBy('contests.created_at', 'desc')
                ->get();
            
            return response()->json(['success' => true, 'contests' => $contests]);
            
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }








  public function deleteBasket(Request $request)
    {
        try {
            $basketId = $request->input('basket_id');
            $userId = $request->input('user_id');

            if (!$basketId || !$userId) {
                return response()->json([
                    'success' => false,
                    'message' => 'basket_id and user_id are required'
                ], 400);
            }

            $basket = DB::table('saved_baskets') // Corrected: use DB facade
                ->where('id', $basketId)
                ->where('user_id', $userId)
                ->first();

            if (!$basket) {
                return response()->json([
                    'success' => false,
                    'message' => 'Basket not found or unauthorized'
                ], 404);
            }

            DB::table('saved_baskets') // Corrected: use DB facade
                ->where('id', $basketId)
                ->where('user_id', $userId)
                ->delete();

            return response()->json([
                'success' => true,
                'message' => 'Basket deleted successfully'
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to delete basket: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete basket: ' . $e->getMessage()
            ], 500);
        }
    }










   public function bulkJoinContest(Request $request)
    {
        $userId = (int) $request->input('user_id');
        $contestId = (int) $request->input('contest_id');
        $entryFee = (float) $request->input('entry_fee', 0);
        $basketIds = $request->input('basket_ids', []);

        // Add detailed logging
        Log::info('=== BULK JOIN CONTEST REQUEST ===');
        Log::info('User ID: ' . $userId);
        Log::info('Contest ID: ' . $contestId);
        Log::info('Entry Fee: ' . $entryFee);
        Log::info('Basket IDs received: ' . json_encode($basketIds));
        Log::info('Basket IDs count: ' . count($basketIds));

        if (!$userId || !$contestId || empty($basketIds)) {
            Log::error('Invalid input - userId: ' . $userId . ', contestId: ' . $contestId . ', basketIds: ' . json_encode($basketIds));
            return response()->json(['success' => false, 'message' => 'Invalid input'], 400);
        }

        return DB::transaction(function () use ($userId, $contestId, $entryFee, $basketIds) {
            $contest = DB::table('contests')->where('id', $contestId)->lockForUpdate()->first();
            if (!$contest) {
                Log::error('Contest not found: ' . $contestId);
                return response()->json(['success' => false, 'message' => 'Contest not found'], 404);
            }

            // Check contest capacity
            $totalEntriesInContest = DB::table('contest_entries')->where('contest_id', $contestId)->count();
            $maxParticipants = (int) ($contest->participants ?? 100);
            $availableSpots = $maxParticipants - $totalEntriesInContest;
            
            if (count($basketIds) > $availableSpots) {
                return response()->json([
                    'success' => false,
                    'message' => "Only {$availableSpots} spots available in this contest"
                ], 400);
            }

            // Check user entry limits
            $userEntriesUsed = DB::table('contest_entries')
                ->where('user_id', $userId)
                ->where('contest_id', $contestId)
                ->count();
                
            $maxEntries = (int) ($contest->max_entries_per_user ?? 1);
            $remainingEntries = $maxEntries - $userEntriesUsed;
            
            if (count($basketIds) > $remainingEntries) {
                return response()->json([
                    'success' => false, 
                    'message' => "You can only select {$remainingEntries} more baskets"
                ], 400);
            }

            $user = User::where('id', $userId)->lockForUpdate()->first();
            if (!$user) {
                Log::error('User not found: ' . $userId);
                return response()->json(['success' => false, 'message' => 'User not found'], 404);
            }

            $totalFee = $entryFee * count($basketIds);
            $totalWalletBalance = floatval($user->deposit_balance ?? 0) + floatval($user->winnings_balance ?? 0);
            
            if ($totalWalletBalance < $totalFee) {
                Log::warning('Insufficient balance - Required: ' . $totalFee . ', Available: ' . $totalWalletBalance);
                return response()->json(['success' => false, 'message' => 'Insufficient balance'], 400);
            }

            $successCount = 0;
            $errors = [];

            Log::info('Starting to process ' . count($basketIds) . ' baskets');
            foreach ($basketIds as $basketId) {
                try {
                    Log::info('Processing basket ID: ' . $basketId);
                    
                    $alreadyJoined = DB::table('contest_entries')
                        ->where('user_id', $userId)
                        ->where('contest_id', $contestId)
                        ->where('basket_id', $basketId)
                        ->exists();

                    if ($alreadyJoined) {
                        $errors[] = "Basket {$basketId}: Already joined";
                        Log::warning('Basket already joined: ' . $basketId);
                        continue;
                    }

                    $sourceBasket = DB::table('saved_baskets')
                        ->where('id', $basketId)
                        ->where('user_id', $userId)
                        ->where('is_standalone', 1)
                        ->first();

                    if (!$sourceBasket) {
                        $errors[] = "Basket {$basketId}: Not found";
                        Log::warning('Basket not found or not standalone: ' . $basketId);
                        continue;
                    }

                    $entryId = DB::table('contest_entries')->insertGetId([
                        'user_id' => $userId,
                        'contest_id' => $contestId,
                        'basket_id' => $basketId,
                        'session_id' => $contest->league_session_id,
                        'total_score' => 0,
                        'created_at' => Carbon::now(),
                        'updated_at' => Carbon::now(),
                    ]);

                    // Deduct from deposit_balance first, then winnings_balance
                    $remainingFee = $entryFee;
                    if ($user->deposit_balance >= $remainingFee) {
                        $user->deposit_balance -= $remainingFee;
                    } else {
                        $remainingFee -= $user->deposit_balance;
                        $user->deposit_balance = 0;
                        $user->winnings_balance -= $remainingFee;
                    }
                    $user->deposit_balance = max(0, $user->deposit_balance);
                    $user->winnings_balance = max(0, $user->winnings_balance);

                    // Insert one transaction per entry with unique transaction_id
                    DB::table('transactions')->insert([
                        'user_id'        => $userId,
                        'contest_id'     => $contestId,
                        'type'           => 'contest_entry',
                        'amount'         => $entryFee,
                        'status'         => 'success',
                        'transaction_id' => 'ENTRY_' . $contestId . '_' . $entryId . '_' . time() . '_' . rand(1000, 9999),
                        'description'    => "Entry fee for Contest #{$contestId}, entry {$entryId}",
                        'created_at'     => Carbon::now(),
                        'updated_at'     => Carbon::now(),
                    ]);

                    $successCount++;
                } catch (\Exception $e) {
                    $errors[] = "Basket {$basketId}: {$e->getMessage()}";
                    Log::error('Error processing basket ' . $basketId . ': ' . $e->getMessage());
                }
            }

            $user->save();

            Log::info('=== BULK JOIN COMPLETED ===');
            Log::info('Success count: ' . $successCount);
            Log::info('Errors: ' . json_encode($errors));

            // Get updated contest data for refresh
            $updatedContest = DB::table('contests')
                ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
                ->where('contests.id', $contestId)
                ->select(
                    'contests.*',
                    'league_sessions.name as session_name',
                    'league_sessions.status as session_status'
                )
                ->first();
            
            $joinedUsersCount = DB::table('contest_entries')
                ->where('contest_id', $contestId)
                ->count();
            
            $maxParticipants = intval($updatedContest->participants ?? 100);
            $spotsLeft = max(0, $maxParticipants - $joinedUsersCount);
            
            $userEntryCount = DB::table('contest_entries')
                ->where('contest_id', $contestId)
                ->where('user_id', $userId)
                ->count();

            return response()->json([
                'success' => true,
                'message' => "Joined with {$successCount} basket(s)",
                'success_count' => $successCount,
                'errors' => $errors,
                'wallet_balance' => floatval($user->deposit_balance) + floatval($user->winnings_balance ?? 0),
                'contest_updated' => [
                    'id' => $contestId,
                    'joined_users' => $joinedUsersCount,
                    'spots_left' => $spotsLeft,
                    'user_entry_count' => $userEntryCount,
                    'remaining_entries' => max(0, intval($updatedContest->max_entries_per_user ?? 1) - $userEntryCount)
                ],
                'should_refresh' => true,
                'unread_notifications' => NotificationController::getUnreadCount($userId),
            ]);
        });
    }
}