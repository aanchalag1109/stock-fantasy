<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\LeagueSession;
use App\Models\Contest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class PerformanceController extends Controller
{
    public function sessions()
    {
        return view('admin.performance.sessions');
    }

    public function sessionDetail($sessionId)
    {
        return view('admin.performance.session-detail', compact('sessionId'));
    }

    public function getSessionContests($sessionId)
    {
        try {
            $contests = \DB::table('contests')
                ->where('league_session_id', $sessionId)
                ->select('id', 'category', 'prize_pool', 'entry_fee', 'participants as max_participants')
                ->get();

            $contests = $contests->map(function($contest) {
                $participantCount = \DB::table('contest_entries')
                    ->where('contest_id', $contest->id)
                    ->count();
                
                $contest->joined_count = $participantCount;
                return $contest;
            });

            return response()->json([
                'success' => true,
                'contests' => $contests
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }

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

    public function sessionContests($sessionId)
    {
        return view('admin.performance.session-detail', compact('sessionId'));
    }

    public function index()
    {
        $sessions = \DB::table('league_sessions')
            ->orderBy('created_at', 'desc')
            ->get();
            
        return view('admin.performance.index', compact('sessions'));
    }

    public function show($contestId)
    {
        \Log::info('Performance show called for contest: ' . $contestId);
        
        try {
            
            $contest = \DB::table('contests')
                ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
                ->select('contests.*', 'league_sessions.name as session_name', 'league_sessions.status as session_status', 'league_sessions.id as league_session_id')
                ->where('contests.id', $contestId)
                ->first();

            if (!$contest) {
                \Log::error('Contest not found: ' . $contestId);
                return redirect()->route('admin.performance.index')->with('error', 'Contest not found');
            }
            
            // Check if contest is cancelled
            if (isset($contest->status) && $contest->status === 'cancelled') {
                return view('admin.performance.cancelled', compact('contest'));
            }
            
            \Log::info('Contest found', ['contest_id' => $contest->id, 'session_id' => $contest->league_session_id]);

            $startPrices = \DB::table('session_asset_prices')
                ->where('league_session_id', $contest->league_session_id)
                ->whereNotNull('start_price')
                ->select('asset_symbol', 'start_price')
                ->get()
                ->keyBy('asset_symbol');
                
            $endPrices = \DB::table('session_asset_prices')
                ->where('league_session_id', $contest->league_session_id)
                ->whereNotNull('end_price')
                ->select('asset_symbol', 'end_price')
                ->get()
                ->keyBy('asset_symbol');
                
            $contestStarted = $startPrices->count() > 0;

            $participants = \DB::table('contest_entries as ce')
                ->leftJoin('users as u', 'ce.user_id', '=', 'u.id')
                ->leftJoin('saved_baskets as sb', 'ce.basket_id', '=', 'sb.id')
                ->where('ce.contest_id', $contestId)
                ->select('ce.*', 'u.name as user_name', 'u.mobile as user_mobile', 'u.winnings_balance', 'sb.assets', 'sb.multipliers')
                ->orderBy('ce.total_score', 'desc')
                ->get();
            
            $actualParticipantsCount = $participants->count();

            // Skip grouped leaderboard - not needed for this view
            $groupedLeaderboard = collect([]);

            $entryFee = floatval($contest->entry_fee ?? 50);
            $platformFeePercent = floatval($contest->platform_fee ?? 30);
            $winningPercent = floatval($contest->winning_percentage ?? 50);
            
            $totalPool = $actualParticipantsCount * $entryFee;
            $platformFeeAmount = $totalPool * ($platformFeePercent / 100);
            $actualPrizePool = $totalPool - $platformFeeAmount;

            $actualWinnersCount = floor($actualParticipantsCount * ($winningPercent / 100));
            if ($actualWinnersCount < 1 && $actualParticipantsCount > 0) $actualWinnersCount = 1;
            if ($actualParticipantsCount == 0) $actualWinnersCount = 0;

            // Check category and session status for prize structure
            $contestCategory = strtolower(trim($contest->category ?? ''));
            $sessionStatus = $contest->session_status ?? 'upcoming';
            
            // For upcoming sessions - use fixed prize distribution from database
            if ($sessionStatus === 'upcoming') {
                $prizeDistJson = json_decode($contest->prize_distribution ?? '[]', true);
                $flexibleDistribution = [];
                if (is_array($prizeDistJson)) {
                    foreach ($prizeDistJson as $item) {
                        $rankStart = $item['rank_start'] ?? 1;
                        $rankEnd = $item['rank_end'] ?? 1;
                        $winners = $item['winners'] ?? 1;
                        $percent = $item['prize_percent'] ?? 0;
                        $perWinner = $item['prize_per_user'] ?? 0;
                        $prize = $perWinner * $winners;
                        
                        $flexibleDistribution[] = [
                            'label' => "Ranks {$rankStart}-{$rankEnd}",
                            'winners' => $winners,
                            'percent' => $percent,
                            'prize' => $prize,
                            'perWinner' => $perWinner
                        ];
                    }
                }
            }
            // For equal category live - use structure from database but recalculate amounts
            elseif ($contestCategory === 'equal' && $sessionStatus === 'live') {
                $prizeDistJson = json_decode($contest->prize_distribution ?? '[]', true);
                $flexibleDistribution = [];
                if (is_array($prizeDistJson)) {
                    foreach ($prizeDistJson as $item) {
                        $rankStart = $item['rank_start'] ?? 1;
                        $rankEnd = $item['rank_end'] ?? 1;
                        $percent = floatval($item['prize_percent'] ?? 0);
                        $winners = intval($item['winners'] ?? 1);
                        $groupPrize = $actualPrizePool * ($percent / 100);
                        $perWinner = $winners > 0 ? floor($groupPrize / $winners) : 0;
                        
                        $flexibleDistribution[] = [
                            'label' => "Ranks {$rankStart}-{$rankEnd}",
                            'winners' => $winners,
                            'percent' => $percent,
                            'prize' => $groupPrize,
                            'perWinner' => $perWinner
                        ];
                    }
                }
            }
            // For equal completed OR flexible/mega live/completed - calculate fully dynamic distribution
            else {
                $flexibleDistribution = $this->getSimplePrizeTable($actualWinnersCount, $actualPrizePool);
            }
            
            // Debug: Log the flexible distribution structure
            \Log::info('Flexible distribution structure:', $flexibleDistribution);
            
            // $this->savePerformancePrizes($contestId, $flexibleDistribution, [
            //     'total_pool' => $totalPool,
            //     'platform_fee' => $platformFeeAmount,
            //     'prize_pool' => $actualPrizePool,
            //     'total_participants' => $actualParticipantsCount,
            //     'total_winners' => $actualWinnersCount
            // ]);

            $stats = [
                'total_participants' => $actualParticipantsCount,
                'profitable_users' => $participants->where('total_score', '>', 0)->count(),
                'avg_score' => round($participants->avg('total_score') ?? 0, 2),
                'highest_score' => $participants->max('total_score') ?? 0,
                'total_pool_generated' => $totalPool,
                'platform_fee_collected' => $platformFeeAmount,
                'actual_prize_pool' => $actualPrizePool,
                'actual_winners' => $actualWinnersCount,
                'start_prices_count' => $startPrices->count(),
                'end_prices_count' => $endPrices->count(),
            ];

            $sessionAssets = \DB::table('league_session_assets')
                ->leftJoin('assets', 'league_session_assets.asset_symbol', '=', 'assets.symbol')
                ->where('league_session_assets.league_session_id', $contest->league_session_id)
                ->select('league_session_assets.asset_symbol as symbol', 'assets.name')
                ->limit(50)
                ->get();

            // Get flexible structure from database (skip if not needed)
            $flexibleStructureDb = collect([]);

            return view('admin.performance.show', compact(
                'contest', 
                'startPrices', 
                'endPrices', 
                'groupedLeaderboard',
                'stats',
                'contestStarted',
                'flexibleDistribution',
                'participants',
                'sessionAssets',
                'flexibleStructureDb'
            ));

        } catch (\Exception $e) {
            \Log::error('Performance show error: ' . $e->getMessage());
            \Log::error('Stack trace: ' . $e->getTraceAsString());
            return redirect()->route('admin.performance.index')->with('error', 'Error loading performance data: ' . $e->getMessage());
        }
    }

    public function showContest($contestId)
    {
        return $this->show($contestId);
    }
    
    public function analytics($contestId)
    {
        $contest = \DB::table('contests')
            ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
            ->select('contests.*', 'league_sessions.name as session_name', 'league_sessions.status as session_status')
            ->where('contests.id', $contestId)
            ->first();

        if (!$contest) {
            return redirect()->route('admin.performance.index')->with('error', 'Contest not found');
        }
        
        $participants = \DB::table('contest_entries as ce')
            ->leftJoin('users as u', 'ce.user_id', '=', 'u.id')
            ->where('ce.contest_id', $contestId)
            ->select('ce.*', 'u.name as user_name', 'u.mobile as user_mobile')
            ->get();
        
        $actualParticipantsCount = $participants->count();
        $entryFee = floatval($contest->entry_fee ?? 50);
        $platformFeePercent = floatval($contest->platform_fee ?? 30);
        $totalPool = $actualParticipantsCount * $entryFee;
        $platformFeeAmount = $totalPool * ($platformFeePercent / 100);
        $actualPrizePool = $totalPool - $platformFeeAmount;
        
        $participantUserIds = $participants->pluck('user_id')->toArray();
        $transactions = \DB::table('transactions')
            ->join('users', 'transactions.user_id', '=', 'users.id')
            ->whereIn('transactions.user_id', $participantUserIds)
            ->where(function($q) use ($contest) {
                $q->where('transactions.contest_id', $contest->id)
                  ->orWhere('transactions.description', 'like', '%Contest #' . $contest->id . '%');
            })
            ->select('transactions.*', 'users.name as user_name', 'users.mobile as user_mobile')
            ->orderBy('transactions.created_at', 'desc')
            ->get();
        
        $stats = [
            'total_participants' => $actualParticipantsCount,
            'total_pool' => $totalPool,
            'platform_fee' => $platformFeeAmount,
            'prize_pool' => $actualPrizePool,
            'total_entry_transactions' => $transactions->where('type', 'contest_entry')->count(),
            'total_winning_transactions' => $transactions->where('type', 'winnings')->count(),
            'total_entry_amount' => $transactions->where('type', 'contest_entry')->sum('amount'),
            'total_winning_amount' => $transactions->where('type', 'winnings')->sum('amount'),
        ];
        
        return view('admin.performance.analytics', compact('contest', 'participants', 'transactions', 'stats'));
    }

    private function getSimplePrizeTable($totalWinners, $prizePool)
    {
        if ($totalWinners <= 0 || $prizePool <= 0) return [];

        // Use PricingController's distribution table
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

        $distribution = [];
        
        // Find NEAREST key (closest to totalWinners)
        $keys = array_keys($prizeDistributionTable);
        sort($keys);
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
        
        foreach ($groups as $group) {
            if ($group['start'] > $totalWinners) continue;
            
            $end = min($group['end'], $totalWinners);
            $groupPrize = $prizePool * ($group['percent'] / 100);
            $numInGroup = $end - $group['start'] + 1;
            $perPersonPrize = floor($groupPrize / $numInGroup);
            
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

    // private function savePerformancePrizes($contestId, $distribution, $poolData)
    // {
    //     \App\Models\ContestPerformancePrize::where('contest_id', $contestId)->delete();
        
    //     foreach ($distribution as $item) {
    //         \App\Models\ContestPerformancePrize::create([
    //             'contest_id' => $contestId,
    //             'rank_label' => $item['label'],
    //             'rank_start' => $this->extractRankStart($item['label']),
    //             'rank_end' => $this->extractRankEnd($item['label']),
    //             'winners_count' => $item['winners'],
    //             'percentage' => $item['percent'],
    //             'prize_amount' => $item['prize'],
    //             'per_winner_amount' => $item['perWinner'],
    //             'total_pool' => $poolData['total_pool'],
    //             'platform_fee' => $poolData['platform_fee'],
    //             'prize_pool' => $poolData['prize_pool'],
    //             'total_participants' => $poolData['total_participants'],
    //             'total_winners' => $poolData['total_winners']
    //         ]);
    //     }
    // }
    
    private function extractRankStart($label)
    {
        if (preg_match('/^(\d+)(st|nd|rd|th) Prize$/', $label, $matches)) {
            return intval($matches[1]);
        }
        if (preg_match('/Ranks (\d+)-/', $label, $matches)) {
            return intval($matches[1]);
        }
        return 1;
    }
    
    private function extractRankEnd($label)
    {
        if (preg_match('/^(\d+)(st|nd|rd|th) Prize$/', $label, $matches)) {
            return intval($matches[1]);
        }
        if (preg_match('/Ranks \d+-(\d+)/', $label, $matches)) {
            return intval($matches[1]);
        }
        return 1;
    }

    public function saveFlexibleStructure(Request $request)
    {
        try {
            $winnerCount = $request->input('winner_count');
            $contestId = $request->input('contest_id');
            $structureData = $request->input('structure_data');
            
            // Delete existing records for this contest
            \App\Models\FlexibleStructure::where('contest_id', $contestId)->delete();
            
            // Insert new records
            foreach ($structureData as $group) {
                \App\Models\FlexibleStructure::create([
                    'winner_count' => $winnerCount,
                    'contest_id' => $contestId,
                    'rank_start' => $group['start'],
                    'rank_end' => $group['end'],
                    'percentage' => $group['percent'],
                    'rank_label' => 'Ranks ' . $group['start'] . '-' . $group['end']
                ]);
            }
            
            return response()->json(['success' => true, 'message' => 'Structure saved successfully']);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    public function getSavedStructure($contestId)
    {
        try {
            $structure = \App\Models\FlexibleStructure::where('contest_id', $contestId)
                ->orderBy('rank_start')
                ->get();
            
            if ($structure->count() > 0) {
                return response()->json(['success' => true, 'structure' => $structure]);
            }
            
            return response()->json(['success' => false, 'message' => 'No structure found']);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    public function getFlexibleStructure($winnerCount)
    {
        try {
            $structure = \App\Models\FlexibleStructure::where('winner_count', $winnerCount)->first();
            
            if ($structure) {
                return response()->json(['success' => true, 'structure' => $structure->structure_data]);
            }
            
            return response()->json(['success' => false, 'message' => 'Structure not found']);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    public function updateEndPrices(\Illuminate\Http\Request $request, $sessionId)
    {
        try {
            $prices = $request->input('prices', []);
            if (empty($prices)) {
                return response()->json(['success' => false, 'message' => 'No prices provided']);
            }
            $updated = 0;
            foreach ($prices as $symbol => $price) {
                \DB::table('session_asset_prices')->updateOrInsert(
                    ['league_session_id' => $sessionId, 'asset_symbol' => $symbol],
                    ['end_price' => floatval($price), 'end_price_fetched_at' => now(), 'updated_at' => now(), 'created_at' => now()]
                );
                $updated++;
            }
            return response()->json(['success' => true, 'updated' => $updated]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    public function liveData($contestId)
    {
        try {
            $participants = \DB::table('contest_entries as ce')
                ->leftJoin('users as u', 'ce.user_id', '=', 'u.id')
                ->where('ce.contest_id', $contestId)
                ->select('ce.*', 'u.name as user_name')
                ->get();
            
            $totalParticipants = $participants->count();
            $profitableUsers = $participants->where('total_score', '>', 0)->count();
            $avgScore = round($participants->avg('total_score') ?? 0, 2);
            
            return response()->json([
                'total_participants' => $totalParticipants,
                'profitable_users' => $profitableUsers,
                'loss_users' => $totalParticipants - $profitableUsers,
                'avg_score' => $avgScore,
                'is_live' => true,
                'is_completed' => false,
                'top_performers' => $participants->sortByDesc('total_score')->take(10)->map(function($p, $index) {
                    return [
                        'rank' => $index + 1,
                        'name' => $p->user_name ?? 'User ' . $p->user_id,
                        'score' => number_format($p->total_score ?? 0, 2),
                        'profit_loss' => ($p->total_score ?? 0) > 0 ? 'profit' : 'loss'
                    ];
                })->values()
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function saveApiStructure(Request $request)
    {
        try {
            $contestId = $request->input('contest_id');
            $apiData = $request->input('api_data');
            
            \Log::info('saveApiStructure called', ['contest_id' => $contestId, 'api_data' => $apiData]);
            
            // Delete existing records
            \App\Models\ContestPerformancePrize::where('contest_id', $contestId)->delete();
            
            // Check if distribution exists in api_data
            if (!isset($apiData['distribution']) || !is_array($apiData['distribution'])) {
                \Log::warning('No distribution found in api_data', ['api_data' => $apiData]);
                return response()->json(['success' => false, 'error' => 'No distribution data'], 400);
            }
            
            // Save API data to performance prizes table
            foreach ($apiData['distribution'] as $item) {
                // Calculate correct prize_amount based on per_winner_amount
                $perWinner = floatval($item['perWinner'] ?? 0);
                $winners = intval($item['winners'] ?? 1);
                $totalPrize = $perWinner * $winners;
                
                \App\Models\ContestPerformancePrize::create([
                    'contest_id' => $contestId,
                    'rank_label' => $item['label'] ?? 'Rank',
                    'rank_start' => $this->extractRankStart($item['label'] ?? 'Rank 1'),
                    'rank_end' => $this->extractRankEnd($item['label'] ?? 'Rank 1'),
                    'winners_count' => $winners,
                    'percentage' => floatval($item['percent'] ?? 0),
                    'per_winner_amount' => $perWinner,
                    'total_pool' => floatval($apiData['totalPool'] ?? 0),
                    'platform_fee' => floatval($apiData['platformFeeAmount'] ?? 0),
                    'prize_pool' => floatval($apiData['totalPrizePool'] ?? 0),
                    'total_participants' => intval($request->input('participants') ?? 0),
                    'total_winners' => intval($apiData['totalWinners'] ?? 0)
                ]);
            }
            
            \Log::info('API structure saved successfully');
            return response()->json(['success' => true, 'message' => 'API structure saved successfully']);
        } catch (\Exception $e) {
            \Log::error('saveApiStructure error: ' . $e->getMessage());
            \Log::error('Stack trace: ' . $e->getTraceAsString());
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    public function updateScoresManually($contestId)
    {
        try {
            \Artisan::call('contest:update-scores-manual', ['contestId' => $contestId]);
            
            return response()->json([
                'success' => true,
                'message' => 'Scores updated successfully'
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function getPrices($contestId)
    {
        try {
            $contest = \DB::table('contests')
                ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
                ->select('contests.*', 'league_sessions.market_type')
                ->where('contests.id', $contestId)
                ->first();

            if (!$contest) {
                return response()->json(['error' => 'Contest not found'], 404);
            }

            $startPrices = \DB::table('session_asset_prices')
                ->where('league_session_id', $contest->league_session_id)
                ->whereNotNull('start_price')
                ->select('asset_symbol', 'start_price')
                ->get()
                ->keyBy('asset_symbol');
                
            $endPrices = \DB::table('session_asset_prices')
                ->where('league_session_id', $contest->league_session_id)
                ->whereNotNull('end_price')
                ->select('asset_symbol', 'end_price')
                ->get()
                ->keyBy('asset_symbol');

            // Get current prices for live contests
            $currentPrices = collect([]);
            if ($contest->status === 'live') {
                $sessionAssets = \DB::table('league_session_assets')
                    ->where('league_session_id', $contest->league_session_id)
                    ->pluck('asset_symbol');

                foreach ($sessionAssets as $symbol) {
                    $currentPrice = $this->getCurrentPrice($symbol, $contest->market_type ?? 'stock');
                    if ($currentPrice > 0) {
                        $currentPrices[$symbol] = $currentPrice;
                    }
                }
            }

            return response()->json([
                'success' => true,
                'start_prices' => $startPrices,
                'end_prices' => $endPrices,
                'current_prices' => $currentPrices,
                'contest_status' => $contest->status
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
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

    public function getParticipants($contestId)
    {
        try {
            $participants = \DB::table('contest_entries as ce')
                ->leftJoin('users as u', 'ce.user_id', '=', 'u.id')
                ->leftJoin('saved_baskets as sb', 'ce.basket_id', '=', 'sb.id')
                ->where('ce.contest_id', $contestId)
                ->select(
                    'ce.*',
                    'u.name as user_name',
                    'u.mobile as user_mobile',
                    'sb.assets',
                    'sb.multipliers'
                )
                ->orderBy('ce.total_score', 'desc')
                ->get();

            return response()->json([
                'success' => true,
                'participants' => $participants,
                'total_count' => $participants->count()
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }
}