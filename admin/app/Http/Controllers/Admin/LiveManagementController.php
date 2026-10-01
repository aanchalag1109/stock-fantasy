<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class LiveManagementController extends Controller
{
    public function index()
    {
        return view('admin.contests.live_management');
    }

    public function getLiveSessionsData(Request $request)
    {
        try {
            $status = $request->get('status', 'all');
            
            // Get sessions with contest counts and participant counts
            $query = DB::table('league_sessions')
                ->leftJoin('contests', 'league_sessions.id', '=', 'contests.league_session_id')
                ->select(
                    'league_sessions.id',
                    'league_sessions.name',
                    'league_sessions.market_type',
                    'league_sessions.status',
                    'league_sessions.start_time',
                    'league_sessions.end_time',
                    'league_sessions.max_stocks',
                    DB::raw('COUNT(DISTINCT contests.id) as contests_count'),
                    DB::raw('COALESCE(SUM(CAST(contests.prize_pool AS DECIMAL(10,2))), 0) as total_prize_pool')
                )
                ->groupBy(
                    'league_sessions.id',
                    'league_sessions.name', 
                    'league_sessions.market_type',
                    'league_sessions.status',
                    'league_sessions.start_time',
                    'league_sessions.end_time',
                    'league_sessions.max_stocks'
                );
                
            if ($status !== 'all') {
                $query->where('league_sessions.status', $status);
            }
            
            $sessions = $query->orderBy('league_sessions.start_time', 'desc')->get();

            // Add participant counts for each session
            foreach ($sessions as $session) {
                $session->participants_count = DB::table('contest_entries')
                    ->leftJoin('contests', 'contest_entries.contest_id', '=', 'contests.id')
                    ->where('contests.league_session_id', $session->id)
                    ->count();
            }

            // Calculate stats
            $liveSessionsCount = DB::table('league_sessions')->where('status', 'live')->count();
            $liveContestsCount = DB::table('contests')
                ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
                ->where('league_sessions.status', 'live')
                ->count();
            $totalParticipants = DB::table('contest_entries')->count();
            $totalPrizePool = DB::table('contests')
                ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
                ->where('league_sessions.status', 'live')
                ->sum(DB::raw('CAST(contests.prize_pool AS DECIMAL(10,2))'));

            return response()->json([
                'success' => true,
                'sessions' => $sessions,
                'live_sessions_count' => $liveSessionsCount,
                'live_contests_count' => $liveContestsCount,
                'total_participants' => $totalParticipants,
                'total_prize_pool' => $totalPrizePool ?: 0
            ]);
        } catch (\Exception $e) {
            \Log::error('getLiveSessionsData error: ' . $e->getMessage());
            
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
                'sessions' => [],
                'live_sessions_count' => 0,
                'live_contests_count' => 0,
                'total_participants' => 0,
                'total_prize_pool' => 0
            ]);
        }
    }

    public function getSessionContests($sessionId)
    {
        try {
            $session = DB::table('league_sessions')->where('id', $sessionId)->first();
            
            if (!$session) {
                return response()->json(['error' => 'Session not found'], 404);
            }

            $contests = DB::table('contests')
                ->where('league_session_id', $sessionId)
                ->get()
                ->map(function($contest) {
                    $contest->joined_count = DB::table('saved_baskets')
                        ->where('contest_id', $contest->id)
                        ->count();
                    return $contest;
                });

            $totalParticipants = $contests->sum('joined_count');
            $totalPrizePool = $contests->sum('prize_pool');

            return response()->json([
                'success' => true,
                'session' => $session,
                'contests' => $contests,
                'total_participants' => $totalParticipants,
                'total_prize_pool' => $totalPrizePool
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function getSessionLeaderboard($sessionId)
    {
        try {
            $leaderboard = DB::table('saved_baskets')
                ->leftJoin('users', 'saved_baskets.user_id', '=', 'users.id')
                ->leftJoin('contests', 'saved_baskets.contest_id', '=', 'contests.id')
                ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
                ->select(
                    'saved_baskets.*',
                    'users.name as user_name',
                    'contests.id as contest_id',
                    'contests.category as contest_category'
                )
                ->where('league_sessions.id', $sessionId)
                ->whereNotNull('saved_baskets.starting_prices')
                ->orderBy('saved_baskets.total_score', 'desc')
                ->get()
                ->map(function($entry, $index) {
                    $entry->rank = $index + 1;
                    $entry->assets = json_decode($entry->assets, true);
                    $entry->starting_prices = json_decode($entry->starting_prices, true);
                    return $entry;
                });

            return response()->json([
                'success' => true,
                'leaderboard' => $leaderboard
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function startSession($sessionId)
    {
        try {
            $session = DB::table('league_sessions')->where('id', $sessionId)->first();
            
            if (!$session) {
                return response()->json(['error' => 'Session not found'], 404);
            }

            // Update session status
            DB::table('league_sessions')
                ->where('id', $sessionId)
                ->update(['status' => 'live']);

            // Update related contests
            DB::table('contests')
                ->where('league_session_id', $sessionId)
                ->update(['status' => 'live']);

            return response()->json([
                'success' => true,
                'message' => 'Session started successfully'
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function endSession($sessionId)
    {
        try {
            $session = DB::table('league_sessions')->where('id', $sessionId)->first();
            
            if (!$session) {
                return response()->json(['error' => 'Session not found'], 404);
            }

            // Update session status
            DB::table('league_sessions')
                ->where('id', $sessionId)
                ->update(['status' => 'completed']);

            // Update related contests
            DB::table('contests')
                ->where('league_session_id', $sessionId)
                ->update(['status' => 'completed']);

            return response()->json([
                'success' => true,
                'message' => 'Session ended successfully'
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function manualCompleteSession($sessionId)
    {
        // Increase limits for large data
        set_time_limit(0); 
        ini_set('memory_limit', '512M');

        try {
            $sessionController = new \App\Http\Controllers\Admin\LeagueSessionController();
            $calculateController = new \App\Http\Controllers\Api\CalculateController();

            $session = DB::table('league_sessions')->where('id', $sessionId)->first();
            if (!$session) return response()->json(['success' => false, 'message' => 'Session not found'], 404);

            if ($session->status === 'completed') {
                return response()->json(['success' => false, 'message' => 'Session already completed.'], 400);
            }

            // Phase 3 logic manually
            DB::table('league_sessions')
                ->where('id', $sessionId)
                ->whereIn('status', ['live', 'completing'])
                ->update(['status' => 'completing']);

            $sessionObj = \App\Models\LeagueSession::find($sessionId);
            
            // Step 1: Save final prices
            $sessionController->saveSessionAssetEndPrices($sessionObj);

            // Step 2: Pay out contests one by one
            $contests = DB::table('contests')
                ->where('league_session_id', $sessionId)
                ->whereNotIn('status', ['cancelled', 'completed'])
                ->get();

            $contestCount = 0;
            foreach ($contests as $contest) {
                // Using a transaction for each contest to ensure atomic distribution
                DB::beginTransaction();
                try {
                    $calculateController->calculateResults(new \Illuminate\Http\Request([
                        'contest_id'    => $contest->id,
                        'credit_wallet' => true
                    ]));
                    
                    DB::table('contests')->where('id', $contest->id)->update(['status' => 'completed']);
                    DB::commit();
                    $contestCount++;
                } catch (\Exception $e) {
                    DB::rollBack();
                    \Log::error("Manual distribution failed for contest {$contest->id}: " . $e->getMessage());
                }
            }

            DB::table('league_sessions')->where('id', $sessionId)->update(['status' => 'completed']);

            return response()->json([
                'success' => true,
                'message' => "Successfully processed session! Winnings distributed for {$contestCount} contests."
            ]);
        } catch (\Exception $e) {
            \Log::error("Manual session completion failed for session {$sessionId}: " . $e->getMessage());
            // Revert status if possible
            DB::table('league_sessions')->where('id', $sessionId)->where('status', 'completing')->update(['status' => 'live']);
            return response()->json(['success' => false, 'message' => 'System Error: ' . $e->getMessage()], 500);
        }
    }

    public function fixOrphanedContests()
    {
        try {
            $orphanedContests = DB::table('contests')
                ->join('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
                ->where('league_sessions.status', 'completed')
                ->whereIn('contests.status', ['live', 'upcoming'])
                ->select('contests.id')
                ->get();

            $count = 0;
            foreach ($orphanedContests as $contest) {
                DB::table('contests')->where('id', $contest->id)->update(['status' => 'completed']);
                $count++;
            }

            return response()->json([
                'success' => true,
                'message' => "Fixed {$count} orphaned contests."
            ]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    public function getContestDetails($contestId)
    {
        try {
            $contest = DB::table('contests')
                ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
                ->select('contests.*', 'league_sessions.name as session_name', 'league_sessions.market_type')
                ->where('contests.id', $contestId)
                ->first();

            if (!$contest) {
                return response()->json(['error' => 'Contest not found'], 404);
            }

            // Debug: Check all possible data sources
            $debugInfo = [
                'contest_exists' => $contest ? true : false,
                'saved_baskets_count' => DB::table('saved_baskets')->where('contest_id', $contestId)->count(),
                'portfolios_count' => DB::table('portfolios')->where('contest_id', $contestId)->count(),
                'saved_baskets_sample' => DB::table('saved_baskets')->where('contest_id', $contestId)->first(),
                'portfolios_sample' => DB::table('portfolios')->where('contest_id', $contestId)->first()
            ];

            // Get participants from multiple sources
            $participants = collect();
            
            // Try saved_baskets first
            $basketParticipants = DB::table('saved_baskets')
                ->leftJoin('users', 'saved_baskets.user_id', '=', 'users.id')
                ->select(
                    'saved_baskets.id',
                    'saved_baskets.user_id',
                    'saved_baskets.assets',
                    'saved_baskets.total_score',
                    'saved_baskets.multipliers',
                    'saved_baskets.starting_prices',
                    'users.name as user_name',
                    'users.email as user_email'
                )
                ->where('saved_baskets.contest_id', $contestId)
                ->get();
            
            // Try portfolios table
            $portfolioParticipants = DB::table('portfolios')
                ->leftJoin('users', 'portfolios.user_id', '=', 'users.id')
                ->select(
                    'portfolios.id',
                    'portfolios.user_id',
                    'portfolios.assets',
                    'portfolios.total_score',
                    'users.name as user_name',
                    'users.email as user_email'
                )
                ->where('portfolios.contest_id', $contestId)
                ->get();
            
            // Combine both sources
            $participants = $basketParticipants->merge($portfolioParticipants);
            
            // Process participants data
            $participants = $participants
                ->sortByDesc('total_score')
                ->values()
                ->map(function($participant, $index) {
                    $participant = (array) $participant;
                    $participant['rank'] = $index + 1;
                    $participant['assets'] = json_decode($participant['assets'] ?? '[]', true) ?: [];
                    $participant['multipliers'] = json_decode($participant['multipliers'] ?? '[]', true) ?: [];
                    $participant['starting_prices'] = json_decode($participant['starting_prices'] ?? '[]', true) ?: [];
                    $participant['user_name'] = $participant['user_name'] ?: 'Unknown User';
                    $participant['user_email'] = $participant['user_email'] ?: 'N/A';
                    $participant['total_score'] = $participant['total_score'] ?: 0;
                    return $participant;
                });

            return response()->json([
                'success' => true,
                'contest' => $contest,
                'participants' => $participants,
                'participants_count' => $participants->count(),
                'debug' => $debugInfo
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function getLiveContestsCount()
    {
        try {
            $count = DB::table('contests')->where('status', 'live')->count();
            
            return response()->json([
                'success' => true,
                'count' => $count
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'count' => 0,
                'error' => $e->getMessage()
            ]);
        }
    }

    public function showContestDetail($contestId)
    {
        return view('admin.contests.live_contest_detail', compact('contestId'));
    }

    public function showSessionContests($sessionId)
    {
        return view('admin.contests.session_contests', compact('sessionId'));
    }

    public function getPortfolioDetails($basketId)
    {
        try {
            // Try saved_baskets first
            $basket = DB::table('saved_baskets')
                ->leftJoin('users', 'saved_baskets.user_id', '=', 'users.id')
                ->select(
                    'saved_baskets.*', 
                    'users.name as user_name'
                )
                ->where('saved_baskets.id', $basketId)
                ->first();

            // If not found, try portfolios table
            if (!$basket) {
                $basket = DB::table('portfolios')
                    ->leftJoin('users', 'portfolios.user_id', '=', 'users.id')
                    ->select('portfolios.*', 'users.name as user_name')
                    ->where('portfolios.id', $basketId)
                    ->first();
            }

            if (!$basket) {
                return response()->json(['error' => 'Portfolio not found'], 404);
            }

            $assets = json_decode($basket->assets ?? '[]', true) ?: [];
            $multipliers = json_decode($basket->multipliers ?? '[]', true) ?: [];
            $startingPrices = json_decode($basket->starting_prices ?? '[]', true) ?: [];
            $endingPrices = json_decode($basket->ending_prices ?? '[]', true) ?: [];
            
            $portfolioAssets = [];
            foreach ($assets as $index => $asset) {
                $symbol = $asset['symbol'] ?? 'N/A';
                $name = $asset['name'] ?? $asset['symbol'] ?? 'Unknown Asset';
                $startPrice = $startingPrices[$symbol] ?? $asset['price'] ?? 0;
                $currentPrice = $asset['current_price'] ?? $startPrice;
                $endPrice = $endingPrices[$symbol] ?? 0;
                $multiplier = $multipliers[$index] ?? 1;
                
                // Ensure multiplier is numeric
                if (is_array($multiplier)) {
                    $multiplier = 1;
                }
                $multiplier = (float) $multiplier;
                
                // Calculate change percentage
                $changePercent = $startPrice > 0 ? (($currentPrice - $startPrice) / $startPrice) * 100 : 0;
                
                // Calculate weighted score
                $weightedScore = $changePercent * $multiplier;
                
                $portfolioAssets[] = [
                    'symbol' => $symbol,
                    'name' => $name,
                    'multiplier' => $multiplier,
                    'start_price' => $startPrice,
                    'current_price' => $currentPrice,
                    'end_price' => $endPrice,
                    'change_percent' => $changePercent,
                    'weighted_score' => $weightedScore
                ];
            }

            return response()->json([
                'success' => true,
                'user_name' => $basket->user_name ?? 'Unknown User',
                'total_score' => $basket->total_score ?? 0,
                'rank' => $basket->rank ?? null,
                'contest_started_at' => $basket->contest_started_at ?? null,
                'contest_ended_at' => $basket->contest_ended_at ?? null,
                'starting_prices' => $startingPrices,
                'ending_prices' => $endingPrices,
                'assets_count' => count($portfolioAssets),
                'portfolio_details' => $portfolioAssets
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }
}