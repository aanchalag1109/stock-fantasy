<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class ApiController extends Controller
{
    private $prizeDistributionTable = [
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

    public function flexiblePricing(Request $request): JsonResponse
    {
        $participants = floatval($request->input('participants', 0));
        $entryFee = floatval($request->input('entry_fee', 0));
        $platformFee = floatval($request->input('platform_fee', 0));
        $winningPercentage = floatval($request->input('winning_percentage', 0));
        $category = $request->input('category', '');

        if ($participants <= 0 || $entryFee <= 0 || $platformFee < 0 || $winningPercentage <= 0) {
            return response()->json(['error' => 'Invalid input parameters'], 400);
        }

        $result = $this->calculateContest($participants, $entryFee, $platformFee, $winningPercentage, $category);
        
        return response()->json($result);
    }

    private function calculateContest($participants, $entryFee, $platformFee, $winningPercentage, $category = '')
    {
        $totalWinners = round($participants * ($winningPercentage / 100));
        $totalPool = $participants * $entryFee;
        $platformFeeAmount = $totalPool * ($platformFee / 100);
        $totalPrizePool = $totalPool - $platformFeeAmount;

        $result = [
            'totalWinners' => $totalWinners,
            'totalPool' => $totalPool,
            'platformFeeAmount' => $platformFeeAmount,
            'totalPrizePool' => $totalPrizePool,
            'distribution' => []
        ];

        if ($totalWinners <= 2) {
            $result['message'] = 'Winners are 2 or less. No groups will be formed.';
            return $result;
        }

        if ($category === 'equal') {
            $perPersonPrize = $totalPrizePool / $totalWinners;
            $result['distribution'][] = [
                'label' => "Ranks 1-{$totalWinners}",
                'prize' => $totalPrizePool,
                'winners' => $totalWinners,
                'perWinner' => floor($perPersonPrize),
                'percent' => 100
            ];
            return $result;
        }

        $chosenStructure = $this->getClosestWinnerCount($totalWinners);
        $keys = array_keys($this->prizeDistributionTable);
        sort($keys);
        
        $lower = null;
        $higher = null;
        foreach ($keys as $k) {
            if ($k <= $totalWinners) $lower = $k;
            if ($k >= $totalWinners && $higher === null) $higher = $k;
        }
        
        $isHigher = $chosenStructure === $higher;
        $groups = $this->prizeDistributionTable[$chosenStructure];
        $adjustedGroups = $this->getAdjustedPrizeGroups($totalWinners, $groups, $chosenStructure, $isHigher);

        foreach ($adjustedGroups as $i => $group) {
            $groupPrize = $totalPrizePool * ($group['percent'] / 100);
            $numInGroup = $group['end'] - $group['start'] + 1;
            $perPersonPrize = $groupPrize / $numInGroup;

            if ($i === count($adjustedGroups) - 1) {
                $originalLastGroup = end($groups);
                $structureWinners = $originalLastGroup['end'] - $originalLastGroup['start'] + 1;
                $actualWinners = $numInGroup;
                
                $divisor = $actualWinners <= $structureWinners ? $structureWinners : $actualWinners;
                $perPersonPrize = $groupPrize / $divisor;
                
                if ($i > 0 && count($result['distribution']) > 0) {
                    $prevPerUser = end($result['distribution'])['perWinner'];
                    if ($perPersonPrize > $prevPerUser) {
                        $perPersonPrize = $prevPerUser * 0.95;
                    }
                }
            }

            $result['distribution'][] = [
                'label' => "Ranks {$group['start']}-{$group['end']}",
                'prize' => $groupPrize,
                'winners' => $numInGroup,
                'perWinner' => floor($perPersonPrize),
                'percent' => $group['percent']
            ];
        }

        return $result;
    }

    private function getClosestWinnerCount($n)
    {
        $keys = array_keys($this->prizeDistributionTable);
        sort($keys);
        
        $lower = $keys[0];
        $higher = end($keys);
        
        foreach ($keys as $k) {
            if ($k <= $n) $lower = $k;
            if ($k >= $n && $higher === end($keys)) $higher = $k;
        }
        
        if ($n === $lower) return $lower;
        if (($n - $lower) === ($higher - $n)) return $higher;
        return ($n - $lower) < ($higher - $n) ? $lower : $higher;
    }

    private function getAdjustedPrizeGroups($actualWinners, $groups, $chosenStructure, $isHigher)
    {
        $adjusted = [];
        
        foreach ($groups as $i => $g) {
            if ($g['start'] > $actualWinners) continue;
            
            if ($i === count($groups) - 1) {
                if ($isHigher) {
                    $g['end'] = min($g['end'], $actualWinners);
                } else {
                    $g['end'] = $actualWinners;
                }
            } else {
                if ($g['end'] > $actualWinners) $g['end'] = $actualWinners;
            }
            
            $adjusted[] = $g;
        }
        
        return $adjusted;
    }

    public function livePrices(Request $request): JsonResponse
    {
        try {
            // Use LivePriceController to get real prices
            $livePriceController = new \App\Http\Controllers\Api\LivePriceController();
            return $livePriceController->getLivePrices($request);
            
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    public function saveStartPrices(Request $request): JsonResponse
    {
        try {
            $contestId = $request->input('contest_id');
            if (!$contestId) {
                return response()->json(['success' => false, 'error' => 'Contest ID required'], 400);
            }
            
            $livePricesResponse = $this->livePrices($request);
            $livePricesData = $livePricesResponse->getData(true);
            
            if (!$livePricesData['success']) {
                return response()->json(['success' => false, 'error' => 'Failed to get live prices'], 500);
            }
            
            $startPrices = array_merge($livePricesData['stocks'] ?? [], $livePricesData['crypto'] ?? []);
            
            DB::table('contests')->where('id', $contestId)->update([
                'start_prices' => json_encode($startPrices),
                'start_prices_saved_at' => now()
            ]);
            
            return response()->json([
                'success' => true,
                'message' => 'Start prices saved successfully',
                'prices_count' => count($startPrices)
            ]);
            
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    public function saveEndPrices(Request $request): JsonResponse
    {
        try {
            $contestId = $request->input('contest_id');
            if (!$contestId) {
                return response()->json(['success' => false, 'error' => 'Contest ID required'], 400);
            }
            
            $livePricesResponse = $this->livePrices($request);
            $livePricesData = $livePricesResponse->getData(true);
            
            if (!$livePricesData['success']) {
                return response()->json(['success' => false, 'error' => 'Failed to get live prices'], 500);
            }
            
            $endPrices = array_merge($livePricesData['stocks'] ?? [], $livePricesData['crypto'] ?? []);
            
            DB::table('contests')->where('id', $contestId)->update([
                'end_prices' => json_encode($endPrices),
                'end_prices_saved_at' => now()
            ]);
            
            return response()->json([
                'success' => true,
                'message' => 'End prices saved successfully',
                'prices_count' => count($endPrices)
            ]);
            
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
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
                    $multiplier = $multipliers[$index] ?? 1;
                    
                    if (isset($startPrices[$symbol]) && isset($endPrices[$symbol])) {
                        $startPrice = $startPrices[$symbol]['price'] ?? 0;
                        $endPrice = $endPrices[$symbol]['price'] ?? 0;
                        
                        if ($startPrice > 0) {
                            $percentChange = (($endPrice - $startPrice) / $startPrice) * 100;
                            $totalScore += $percentChange * $multiplier;
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

    public function addSamplePrices($contestId): JsonResponse
    {
        try {
            if (!$contestId) {
                return response()->json(['success' => false, 'message' => 'Contest ID required'], 400);
            }
            
            $contest = DB::table('contests')->where('id', $contestId)->first();
            if (!$contest) {
                return response()->json(['success' => false, 'message' => 'Contest not found'], 404);
            }
            
            $sampleStartPrices = [
                'AAPL' => ['price' => 145.50, 'change' => 0, 'change_percent' => 0],
                'GOOGL' => ['price' => 2800.00, 'change' => 0, 'change_percent' => 0],
                'MSFT' => ['price' => 300.00, 'change' => 0, 'change_percent' => 0],
                'TSLA' => ['price' => 250.00, 'change' => 0, 'change_percent' => 0],
                'BTC-USD' => ['price' => 44000.00, 'change' => 0, 'change_percent' => 0],
                'ETH-USD' => ['price' => 3200.00, 'change' => 0, 'change_percent' => 0]
            ];
            
            $sampleEndPrices = [
                'AAPL' => ['price' => 148.75, 'change' => 3.25, 'change_percent' => 2.23],
                'GOOGL' => ['price' => 2765.50, 'change' => -34.50, 'change_percent' => -1.23],
                'MSFT' => ['price' => 307.80, 'change' => 7.80, 'change_percent' => 2.60],
                'TSLA' => ['price' => 242.30, 'change' => -7.70, 'change_percent' => -3.08],
                'BTC-USD' => ['price' => 46200.00, 'change' => 2200.00, 'change_percent' => 5.00],
                'ETH-USD' => ['price' => 3040.00, 'change' => -160.00, 'change_percent' => -5.00]
            ];
            
            DB::table('contests')->where('id', $contestId)->update([
                'start_prices' => json_encode($sampleStartPrices),
                'end_prices' => json_encode($sampleEndPrices),
                'start_prices_saved_at' => now(),
                'end_prices_saved_at' => now()
            ]);
            
            return response()->json([
                'success' => true,
                'message' => 'Sample prices added successfully',
                'start_prices_count' => count($sampleStartPrices),
                'end_prices_count' => count($sampleEndPrices)
            ]);
            
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    public function upcomingSessions(): JsonResponse
    {
        try {
            $sessions = DB::table('league_sessions')
                ->where('status', 'upcoming')
                ->orderBy('start_time', 'asc')
                ->get();
            
            return response()->json(['success' => true, 'sessions' => $sessions]);
            
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    public function liveSessions(): JsonResponse
    {
        try {
            $sessions = DB::table('league_sessions')
                ->where('status', 'live')
                ->orderBy('start_time', 'asc')
                ->get();
            
            return response()->json(['success' => true, 'sessions' => $sessions]);
            
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

    public function banners(): JsonResponse
    {
        try {
            $banners = DB::table('banners')
                ->where('status', 'active')
                ->orderBy('id', 'desc')
                ->get();
            
            return response()->json(['success' => true, 'banners' => $banners]);
            
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    public function saveFCMToken(Request $request): JsonResponse
    {
        try {
            $userId = $request->input('user_id');
            $fcmToken = $request->input('fcm_token');
            
            if (!$userId || !$fcmToken) {
                return response()->json(['success' => false, 'message' => 'User ID and FCM token required'], 400);
            }
            
            DB::table('users')->where('id', $userId)->update(['fcm_token' => $fcmToken]);
            
            return response()->json(['success' => true, 'message' => 'FCM token saved successfully']);
            
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }
}