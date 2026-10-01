<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class SessionController extends Controller
{
    public function upcomingSessions(): JsonResponse
    {
        try {
            $sessions = DB::table('league_sessions')
                ->leftJoin('contests', 'league_sessions.id', '=', 'contests.league_session_id')
                ->where('league_sessions.status', 'upcoming')
                ->select(
                    'league_sessions.id',
                    'league_sessions.name',
                    'league_sessions.start_time',
                    'league_sessions.end_time',
                    'league_sessions.status',
                    'league_sessions.market_type',
                    'league_sessions.max_stocks',
                    'league_sessions.user_joining_start_time',
                    'league_sessions.active',
                    'league_sessions.stocks',
                    'league_sessions.cryptos',
                    'league_sessions.image_url',
                    'league_sessions.created_at',
                    'league_sessions.updated_at',
                    DB::raw('COALESCE(SUM(contests.prize_pool), 0) as total_prize_pool')
                )
                ->groupBy(
                    'league_sessions.id',
                    'league_sessions.name',
                    'league_sessions.start_time',
                    'league_sessions.end_time',
                    'league_sessions.status',
                    'league_sessions.market_type',
                    'league_sessions.max_stocks',
                    'league_sessions.user_joining_start_time',
                    'league_sessions.active',
                    'league_sessions.stocks',
                    'league_sessions.cryptos',
                    'league_sessions.image_url',
                    'league_sessions.created_at',
                    'league_sessions.updated_at'
                )
                ->orderBy('league_sessions.start_time', 'asc')
                ->get();
            
            foreach ($sessions as $session) {
                $session->image_url = $session->image_url ? url($session->image_url) : null;
            }
            
            return response()->json([
                'success' => true,
                'sessions' => $sessions,
                'unread_notifications' => NotificationController::getUnreadCount(),
            ]);
            
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
            
            return response()->json([
                'success' => true,
                'sessions' => $sessions,
                'unread_notifications' => NotificationController::getUnreadCount(),
            ]);
            
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    public function getSession($sessionId): JsonResponse
    {
        try {
            $session = DB::table('league_sessions')
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
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function getUserJoinedSessions(Request $request): JsonResponse
    {
        try {
            $userId = $request->query('user_id');
            $status = $request->query('status'); // upcoming, live, completed
            $debug = $request->query('debug', false); // Debug mode
            
            if (!$userId) {
                return response()->json([
                    'success' => false,
                    'error' => 'user_id is required'
                ], 400);
            }

            // Debug: Check contest entries
            if ($debug) {
                $contestEntries = DB::table('contest_entries')
                    ->where('user_id', $userId)
                    ->get();
                
                return response()->json([
                    'debug' => true,
                    'user_id' => $userId,
                    'contest_entries_count' => $contestEntries->count(),
                    'contest_entries' => $contestEntries
                ]);
            }

            $query = DB::table('league_sessions')
                ->join('contests', 'league_sessions.id', '=', 'contests.league_session_id')
                ->join('contest_entries', 'contests.id', '=', 'contest_entries.contest_id')
                ->where('contest_entries.user_id', $userId);
            
            // Filter by status if provided
            if ($status) {
                $query->where('league_sessions.status', $status);
            }
            
            $sessions = $query->select(
                    'league_sessions.id',
                    'league_sessions.name',
                    'league_sessions.start_time',
                    'league_sessions.end_time',
                    'league_sessions.status',
                    'league_sessions.image_url',
                    DB::raw('COUNT(DISTINCT contest_entries.id) as total_entries'),
                    DB::raw('COUNT(DISTINCT contests.id) as contests_joined')
                )
                ->groupBy(
                    'league_sessions.id',
                    'league_sessions.name',
                    'league_sessions.start_time',
                    'league_sessions.end_time',
                    'league_sessions.status',
                    'league_sessions.image_url'
                )
                ->orderBy('league_sessions.start_time', 'desc')
                ->get();
            
            // Calculate total prize pool for each session (including flexible contests)
            foreach ($sessions as $session) {
                $contests = DB::table('contests')
                    ->join('contest_entries', 'contests.id', '=', 'contest_entries.contest_id')
                    ->where('contests.league_session_id', $session->id)
                    ->where('contest_entries.user_id', $userId)
                    ->select('contests.id', 'contests.category', 'contests.prize_pool', 'contests.entry_fee', 'contests.platform_fee')
                    ->distinct()
                    ->get();
                
                $totalPrizePool = 0;
                foreach ($contests as $contest) {
                    $prizePool = floatval($contest->prize_pool);
                    
                    // Calculate dynamic prize pool only for live/completed sessions
                    if (in_array($session->status, ['live', 'completed']) && in_array(strtolower($contest->category), ['flexible', 'mega', 'equal'])) {
                        $joinedCount = DB::table('contest_entries')->where('contest_id', $contest->id)->count();
                        $entryFee = floatval($contest->entry_fee ?? 0);
                        $platformFeePercent = floatval($contest->platform_fee ?? 0);
                        $totalPool = $joinedCount * $entryFee;
                        $platformFeeAmount = ($totalPool * $platformFeePercent) / 100;
                        $prizePool = $totalPool - $platformFeeAmount;
                    }
                    
                    $totalPrizePool += $prizePool;
                }
                
                $session->total_prize_pool = $totalPrizePool;
                $session->image_url = $session->image_url ? url($session->image_url) : null;
            }

            return response()->json([
                'success' => true,
                'sessions' => $sessions,
                'total' => $sessions->count(),
                'unread_notifications' => NotificationController::getUnreadCount($userId),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }
}