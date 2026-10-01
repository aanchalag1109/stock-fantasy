<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;

class PendingPrizesController extends Controller
{
    /**
     * Show pending prizes page
     * Only shows sessions from last 7 days, with filter for pending/paid
     */
    public function index(Request $request)
    {
        $filter = $request->query('filter', 'pending'); // pending, paid, all
        $days = intval($request->query('days', 7)); // last X days only

        $cutoffDate = Carbon::now('Asia/Kolkata')->subDays($days);

        $sessions = DB::table('league_sessions')
            ->where('status', 'completed')
            ->where('end_time', '>=', $cutoffDate)
            ->orderBy('end_time', 'desc')
            ->get();

        $pendingSessions = [];

        foreach ($sessions as $session) {
            $contests = DB::table('contests')
                ->where('league_session_id', $session->id)
                ->whereNotIn('status', ['cancelled'])
                ->get();

            if ($contests->isEmpty()) continue;

            $contestData = [];
            $sessionHasPending = false;
            $sessionHasPaid = false;

            foreach ($contests as $contest) {
                $participants = DB::table('contest_entries')
                    ->where('contest_id', $contest->id)
                    ->count();

                if ($participants == 0) continue;

                // Check actual winnings paid (amount > 0 only)
                $totalWinningsPaid = DB::table('transactions')
                    ->where('contest_id', $contest->id)
                    ->where('type', 'winnings')
                    ->where('status', 'success')
                    ->where('amount', '>', 0)
                    ->sum('amount');

                $winnersCount = DB::table('transactions')
                    ->where('contest_id', $contest->id)
                    ->where('type', 'winnings')
                    ->where('status', 'success')
                    ->where('amount', '>', 0)
                    ->count();

                $isPaid = $totalWinningsPaid > 0;

                if ($isPaid) {
                    $sessionHasPaid = true;
                } else {
                    $sessionHasPending = true;
                }

                // Apply filter
                if ($filter === 'pending' && $isPaid) continue;
                if ($filter === 'paid' && !$isPaid) continue;

                $contestData[] = [
                    'id' => $contest->id,
                    'category' => $contest->category ?? 'N/A',
                    'entry_fee' => $contest->entry_fee ?? 0,
                    'prize_pool' => $contest->prize_pool ?? 0,
                    'participants' => $participants,
                    'is_paid' => $isPaid,
                    'total_winnings_paid' => $totalWinningsPaid,
                    'winners_count' => $winnersCount,
                ];
            }

            if (!empty($contestData)) {
                $pendingSessions[] = [
                    'session' => $session,
                    'contests' => $contestData,
                    'has_pending' => $sessionHasPending,
                    'has_paid' => $sessionHasPaid,
                ];
            }
        }

        return view('admin.pending-prizes', compact('pendingSessions', 'filter', 'days'));
    }

    /**
     * Distribute prizes for a single contest
     */
    public function distributeContest(Request $request, $contestId)
    {
        try {
            $result = $this->processDistribution($contestId);
            return response()->json($result);
        } catch (\Exception $e) {
            Log::error("Manual prize distribution failed for contest #{$contestId}: " . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Error: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Distribute prizes for all contests in a session
     */
    public function distributeSession(Request $request, $sessionId)
    {
        try {
            $contests = DB::table('contests')
                ->where('league_session_id', $sessionId)
                ->whereNotIn('status', ['cancelled'])
                ->get();

            $results = [];
            $totalWinners = 0;
            $totalAmount = 0;

            foreach ($contests as $contest) {
                $result = $this->processDistribution($contest->id);
                $results[] = $result;
                if ($result['success']) {
                    $totalWinners += $result['winners_count'] ?? 0;
                    $totalAmount += $result['total_amount'] ?? 0;
                }
            }

            return response()->json([
                'success' => true,
                'message' => "Session #{$sessionId}: {$totalWinners} winners ko ₹{$totalAmount} distribute hua",
                'total_winners' => $totalWinners,
                'total_amount' => $totalAmount,
                'contest_results' => $results
            ]);
        } catch (\Exception $e) {
            Log::error("Manual session distribution failed for session #{$sessionId}: " . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Error: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Core logic: Calculate scores + distribute prizes for a contest
     */
    private function processDistribution($contestId): array
    {
        $contest = DB::table('contests')->where('id', $contestId)->first();
        if (!$contest) {
            return ['success' => false, 'message' => "Contest #{$contestId} not found"];
        }

        $sessionId = $contest->league_session_id;
        $session = DB::table('league_sessions')->where('id', $sessionId)->first();
        if (!$session) {
            return ['success' => false, 'message' => "Session not found for contest #{$contestId}"];
        }

        $participants = DB::table('contest_entries')->where('contest_id', $contestId)->count();
        if ($participants == 0) {
            return ['success' => false, 'message' => "Contest #{$contestId}: No participants"];
        }

        // STRICT duplicate check — if ANY real prize (amount > 0) already paid, block
        $alreadyPaidTotal = DB::table('transactions')
            ->where('contest_id', $contestId)
            ->where('type', 'winnings')
            ->where('status', 'success')
            ->where('amount', '>', 0)
            ->sum('amount');

        if ($alreadyPaidTotal > 0) {
            return [
                'success' => false,
                'message' => "Contest #{$contestId}: Already paid ₹" . floor($alreadyPaidTotal),
                'already_paid' => true
            ];
        }

        // Clean up any old 0-amount or failed winnings entries
        DB::table('transactions')
            ->where('contest_id', $contestId)
            ->where('type', 'winnings')
            ->where(function($q) {
                $q->where('amount', '<=', 0)
                  ->orWhere('status', '!=', 'success');
            })
            ->delete();

        // Step 1: Get session prices
        $startPrices = DB::table('session_asset_prices')
            ->where('league_session_id', $sessionId)
            ->whereNotNull('start_price')
            ->pluck('start_price', 'asset_symbol')
            ->toArray();

        $endPrices = DB::table('session_asset_prices')
            ->where('league_session_id', $sessionId)
            ->whereNotNull('end_price')
            ->pluck('end_price', 'asset_symbol')
            ->toArray();

        if (empty($startPrices) || empty($endPrices)) {
            return ['success' => false, 'message' => "Contest #{$contestId}: Start or end prices missing"];
        }

        // Step 2: Calculate scores for ALL entries
        $entries = DB::table('contest_entries as ce')
            ->leftJoin('saved_baskets as sb', 'ce.basket_id', '=', 'sb.id')
            ->where('ce.contest_id', $contestId)
            ->select('ce.id', 'ce.user_id', 'ce.starting_prices', 'sb.assets', 'sb.multipliers')
            ->get();

        foreach ($entries as $entry) {
            $entryStartPrices = json_decode($entry->starting_prices ?? '[]', true) ?? [];
            if (empty($entryStartPrices)) {
                $entryStartPrices = $startPrices;
            }

            $assets = json_decode($entry->assets ?? '[]', true) ?? [];
            $multipliers = json_decode($entry->multipliers ?? '[]', true) ?? [];
            $totalScore = 0;

            foreach ($assets as $index => $asset) {
                $symbol = $asset['symbol'] ?? $asset['name'] ?? null;
                if (!$symbol) continue;

                $startPrice = $entryStartPrices[$symbol] ?? 0;
                if ($startPrice <= 0) continue;

                $endPrice = $endPrices[$symbol] ?? 0;
                if ($endPrice <= 0) continue;

                $priceChangePercent = (($endPrice - $startPrice) / $startPrice) * 100;

                $multiplierData = $multipliers[$index] ?? ['multiplier' => 1, 'prediction' => 'UP'];
                $multiplier = is_array($multiplierData) ? ($multiplierData['multiplier'] ?? 1) : $multiplierData;
                $prediction = strtoupper(is_array($multiplierData) ? ($multiplierData['prediction'] ?? 'UP') : 'UP');

                if ($prediction === 'DOWN') {
                    $directionalPercent = -$priceChangePercent;
                } else {
                    $directionalPercent = $priceChangePercent;
                }

                $totalScore += round($directionalPercent * $multiplier, 2) * 100;
            }

            DB::table('contest_entries')->where('id', $entry->id)->update([
                'total_score' => round($totalScore, 2),
                'updated_at' => now()
            ]);
        }

        // Step 3: Assign ranks
        $rankedEntries = DB::table('contest_entries')
            ->where('contest_id', $contestId)
            ->orderBy('total_score', 'desc')
            ->orderBy('created_at', 'asc')
            ->get();

        $currentRank = 1;
        $previousScore = null;

        foreach ($rankedEntries as $index => $entry) {
            if ($previousScore !== null && $entry->total_score == $previousScore) {
                // tie — same rank
            } else {
                $currentRank = $index + 1;
            }
            DB::table('contest_entries')->where('id', $entry->id)->update(['rank' => $currentRank]);
            $previousScore = $entry->total_score;
        }

        // Step 4: Build prize structure — MATCH app logic exactly
        $isFixed = !empty($contest->is_fixed_prize) || in_array($contest->category, ['guaranteed', 'practice']);

        $prizeRows = []; // array of ['rank_start', 'rank_end', 'per_winner_amount']

        if ($isFixed) {
            // Fixed (practice/guaranteed): use stored prize_distribution JSON (same as app)
            $prizeDistJson = json_decode($contest->prize_distribution ?? '[]', true);
            if (is_array($prizeDistJson) && !empty($prizeDistJson)) {
                foreach ($prizeDistJson as $item) {
                    $perWinner = floatval(
                        $item['per_winner'] ?? $item['perWinner'] ??
                        $item['per_winner_amount'] ?? 0
                    );
                    $rankStart = intval($item['rank_start'] ?? 1);
                    $rankEnd   = intval($item['rank_end'] ?? $rankStart);
                    $prizeRows[] = [
                        'rank_start' => $rankStart,
                        'rank_end' => $rankEnd,
                        'per_winner_amount' => $perWinner,
                    ];
                }
            }
        }

        // If no fixed prize rows, generate dynamically (mega/equal or fixed without JSON)
        if (empty($prizeRows)) {
            $this->generatePrizeStructure($contest, $participants);
            $generated = DB::table('contest_performance_prizes')
                ->where('contest_id', $contestId)
                ->orderBy('rank_start')
                ->get();
            foreach ($generated as $g) {
                $prizeRows[] = [
                    'rank_start' => intval($g->rank_start),
                    'rank_end' => intval($g->rank_end),
                    'per_winner_amount' => floatval($g->per_winner_amount),
                ];
            }
        }

        if (empty($prizeRows)) {
            return ['success' => false, 'message' => "Contest #{$contestId}: Could not generate prize structure (prize pool may be 0)"];
        }

        // Step 5: Distribute prizes in transaction — WITH TIE SPLITTING (same as leaderboard)
        $winnersCount = 0;
        $totalAmountDistributed = 0;

        DB::beginTransaction();
        try {
            $rankedEntries = DB::table('contest_entries')
                ->where('contest_id', $contestId)
                ->orderBy('rank')
                ->orderBy('total_score', 'desc')
                ->get();

            // Helper: find prize for a specific rank from prizeRows
            $prizeForRank = function($r) use ($prizeRows) {
                foreach ($prizeRows as $prize) {
                    if ($r >= $prize['rank_start'] && $r <= $prize['rank_end']) {
                        return floatval($prize['per_winner_amount']);
                    }
                }
                return 0;
            };

            $txCounter = 0;
            $processedRanks = [];

            foreach ($rankedEntries as $entry) {
                $rank = $entry->rank;

                // Skip if this rank group already processed
                if (in_array($rank, $processedRanks)) continue;
                $processedRanks[] = $rank;

                // Get ALL entries tied at this rank
                $tiedEntries = $rankedEntries->where('rank', $rank);
                $tiedCount = $tiedEntries->count();

                // Calculate prize amount per tied user (SAME as leaderboard)
                if ($tiedCount > 1) {
                    // Sum prizes for ranks [rank .. rank+tiedCount-1], then split equally
                    $totalPrize = 0;
                    for ($r = $rank; $r < $rank + $tiedCount; $r++) {
                        $totalPrize += $prizeForRank($r);
                    }
                    $prizeAmount = $totalPrize > 0 ? round($totalPrize / $tiedCount, 2) : 0;
                } else {
                    $prizeAmount = round($prizeForRank($rank), 2);
                }

                if ($prizeAmount <= 0) continue;

                // Credit each tied user the same split amount
                foreach ($tiedEntries as $tiedEntry) {
                    DB::table('users')
                        ->where('id', $tiedEntry->user_id)
                        ->increment('winnings_balance', $prizeAmount);

                    $txCounter++;
                    $txId = 'MP_' . $contestId . '_E' . $tiedEntry->id . '_' . now()->timestamp . '_' . $txCounter . rand(100, 999);

                    DB::table('transactions')->insert([
                        'user_id' => $tiedEntry->user_id,
                        'contest_id' => $contestId,
                        'type' => 'winnings',
                        'amount' => $prizeAmount,
                        'status' => 'success',
                        'transaction_id' => $txId,
                        'description' => "Won ₹{$prizeAmount} in contest #{$contestId} (Rank {$rank}, Entry #{$tiedEntry->id})",
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);

                    $winnersCount++;
                    $totalAmountDistributed += $prizeAmount;
                }
            }

            // Mark as distributed
            DB::table('contests')->where('id', $contestId)->update([
                'prizes_distributed' => 1,
                'is_calculated' => 1,
                'updated_at' => now()
            ]);

            DB::commit();

            return [
                'success' => true,
                'message' => "Contest #{$contestId}: ₹{$totalAmountDistributed} → {$winnersCount} winners",
                'winners_count' => $winnersCount,
                'total_amount' => $totalAmountDistributed,
                'contest_id' => $contestId
            ];

        } catch (\Exception $e) {
            DB::rollBack();
            throw $e;
        }
    }

    /**
     * Generate prize structure for a contest
     * Uses EXACT same logic as app's buildDynamicPrizeDistribution
     */
    private function generatePrizeStructure($contest, $participants)
    {
        $entryFee = floatval($contest->entry_fee ?? 0);
        $platformFeePercent = floatval($contest->platform_fee ?? 30);
        $winningPercent = floatval($contest->winning_percentage ?? 50);
        $category = $contest->category ?? 'mega';

        // Determine prize pool (same as app)
        if ($entryFee == 0) {
            // Practice/Guaranteed with fixed prize pool
            $totalPool = floatval($contest->prize_pool ?? $contest->fixed_prize_pool ?? 0);
            $actualPrizePool = $totalPool;
        } else {
            $totalPool = $participants * $entryFee;
            $platformFeeAmount = $totalPool * ($platformFeePercent / 100);
            $actualPrizePool = $totalPool - $platformFeeAmount;
        }

        if ($actualPrizePool <= 0) return;

        // Winners count based on winning_percentage (same as app)
        $actualWinnersCount = max(1, floor($participants * ($winningPercent / 100)));

        // Build distribution using SAME logic as app
        $distribution = $this->buildDynamicPrizeDistribution($actualWinnersCount, $actualPrizePool, $category);
        if (empty($distribution)) return;

        // Clear old and insert new
        DB::table('contest_performance_prizes')->where('contest_id', $contest->id)->delete();

        foreach ($distribution as $dist) {
            DB::table('contest_performance_prizes')->insert([
                'contest_id' => $contest->id,
                'rank_label' => $dist['rank_label'],
                'rank_start' => $dist['rank_start'],
                'rank_end' => $dist['rank_end'],
                'winners_count' => $dist['winners_count'],
                'percentage' => $dist['percentage'],
                'prize_amount' => $dist['prize_amount'],
                'per_winner_amount' => $dist['per_winner_amount'],
                'total_pool' => $totalPool,
                'platform_fee' => $totalPool - $actualPrizePool,
                'prize_pool' => $actualPrizePool,
                'total_participants' => $participants,
                'total_winners' => $actualWinnersCount,
                'created_at' => now(),
                'updated_at' => now()
            ]);
        }
    }

    /**
     * EXACT copy of app's buildDynamicPrizeDistribution for consistency
     */
    private function buildDynamicPrizeDistribution(int $totalWinners, float $prizePool, string $category = 'mega'): array
    {
        if ($totalWinners <= 0 || $prizePool <= 0) return [];

        // Equal: single row, equal split among all winners
        if ($category === 'equal') {
            $perWinner = round($prizePool / $totalWinners, 2);
            return [[
                'rank_label'        => "Rank 1 to {$totalWinners}",
                'rank_start'        => 1,
                'rank_end'          => $totalWinners,
                'winners_count'     => $totalWinners,
                'percentage'        => 100,
                'prize_amount'      => round($prizePool, 2),
                'per_winner_amount' => $perWinner,
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

        $isHigher = $chosenKey > $totalWinners;
        $tiers = $tables[$chosenKey];
        $dist  = [];
        $previousPerWin = PHP_FLOAT_MAX;

        foreach ($tiers as $idx => [$s, $e, $pct]) {
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

                if ($perWin > $previousPerWin) {
                    $perWin = round($previousPerWin * 0.95, 2);
                }
            } else {
                $perWin = $cnt > 0 ? round($prize / $cnt, 2) : 0;
            }

            $dist[] = [
                'rank_label'        => "Rank {$s} to {$end}",
                'rank_start'        => $s,
                'rank_end'          => $end,
                'winners_count'     => $cnt,
                'percentage'        => round($pct, 4),
                'prize_amount'      => $prize,
                'per_winner_amount' => $perWin,
            ];

            $previousPerWin = $perWin;
            if ($end >= $totalWinners) break;
        }

        // Extra winners beyond table — only if LOWER structure chosen
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
                    'rank_label'        => "Rank {$es} to {$ee}",
                    'rank_start'        => $es,
                    'rank_end'          => $ee,
                    'winners_count'     => $ec,
                    'percentage'        => round($lp, 4),
                    'prize_amount'      => $ep,
                    'per_winner_amount' => $epw,
                ];
            }
        }

        return $dist;
    }
}
