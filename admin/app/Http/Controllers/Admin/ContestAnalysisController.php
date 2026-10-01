<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ContestAnalysisController extends Controller
{
    public function index(Request $request)
    {
        $query = DB::table('league_sessions');
        
        // Date filter
        if ($request->filled('from_date')) {
            $query->whereDate('start_time', '>=', $request->from_date);
        }
        
        if ($request->filled('to_date')) {
            $query->whereDate('start_time', '<=', $request->to_date);
        }
        
        // Status filter
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        
        $sessions = $query->orderBy('created_at', 'desc')->get();
        
        return view('admin.contest_analysis.index', compact('sessions'));
    }

    public function sessionDetail($sessionId)
    {
        $session = DB::table('league_sessions')->where('id', $sessionId)->first();
        
        if (!$session) {
            return redirect()->route('admin.contest-analysis.index')->with('error', 'Session not found');
        }

        $contests = DB::table('contests')
            ->where('league_session_id', $sessionId)
            ->select('id', 'category', 'entry_fee', 'prize_pool', 'status', 'participants')
            ->get();

        $contestsData = $contests->map(function($contest) {
            $totalPlayers = DB::table('contest_entries')->where('contest_id', $contest->id)->count();
            $totalWinnings = DB::table('transactions')
                ->where('contest_id', $contest->id)
                ->where('type', 'contest_winning')
                ->sum('amount');

            return [
                'id' => $contest->id,
                'category' => $contest->category,
                'entry_fee' => $contest->entry_fee,
                'prize_pool' => $contest->prize_pool,
                'status' => $contest->status,
                'total_players' => $totalPlayers,
                'total_winnings' => $totalWinnings
            ];
        });

        return view('admin.contest_analysis.session_detail', compact('session', 'contestsData'));
    }

    public function contestDetail(Request $request, $contestId)
    {
        $contest = DB::table('contests as c')
            ->leftJoin('league_sessions as ls', 'c.league_session_id', '=', 'ls.id')
            ->where('c.id', $contestId)
            ->select('c.*', 'ls.name as session_name')
            ->first();

        if (!$contest) {
            return redirect()->route('admin.contest-analysis.index')->with('error', 'Contest not found');
        }

        // Leaderboard with user filter
        $query = DB::table('contest_entries as ce')
            ->leftJoin('users as u', 'ce.user_id', '=', 'u.id')
            ->where('ce.contest_id', $contestId);
        
        if ($request->filled('user_id')) {
            $query->where('ce.user_id', $request->user_id);
        }
        
        $leaderboard = $query->select('ce.rank', 'u.name', 'u.mobile', 'ce.total_score', 'ce.user_id')
            ->orderBy('ce.rank')
            ->get();

        // Winning Transactions with user filter
        $txnQuery = DB::table('transactions as t')
            ->leftJoin('users as u', 't.user_id', '=', 'u.id')
            ->where('t.contest_id', $contestId)
            ->where('t.type', 'winnings');
        
        if ($request->filled('user_id')) {
            $txnQuery->where('t.user_id', $request->user_id);
        }
        
        $winningTransactions = $txnQuery->select('u.name', 'u.mobile', 't.amount', 't.description', 't.created_at')
            ->orderBy('t.amount', 'desc')
            ->get();

        // Prize Structure
        $prizeStructure = DB::table('contest_performance_prizes')
            ->where('contest_id', $contestId)
            ->orderBy('rank_start')
            ->get();

        // Stats
        $stats = [
            'total_players' => $leaderboard->count(),
            'total_prize_distributed' => $winningTransactions->sum('amount'),
            'winners_count' => $winningTransactions->count(),
            'entry_fee' => $contest->entry_fee,
            'total_pool' => $leaderboard->count() * $contest->entry_fee
        ];

        return view('admin.contest_analysis.contest_detail', compact(
            'contest', 
            'leaderboard', 
            'winningTransactions', 
            'prizeStructure',
            'stats'
        ));
    }

    public function usersList(Request $request)
    {
        $query = DB::table('users')
            ->select('id', 'name', 'mobile', 'email', 'created_at');
        
        // Search filter
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('mobile', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%");
            });
        }
        
        // Date filter
        if ($request->filled('from_date')) {
            $query->whereDate('created_at', '>=', $request->from_date);
        }
        
        if ($request->filled('to_date')) {
            $query->whereDate('created_at', '<=', $request->to_date);
        }
        
        $users = $query->orderBy('created_at', 'desc')->get();

        $usersData = $users->map(function($user) {
            $totalContests = DB::table('contest_entries')->where('user_id', $user->id)->count();
            $totalWinnings = DB::table('transactions')
                ->where('user_id', $user->id)
                ->where('type', 'winnings')
                ->sum('amount');

            return [
                'id' => $user->id,
                'name' => $user->name,
                'mobile' => $user->mobile,
                'email' => $user->email,
                'total_contests' => $totalContests,
                'total_winnings' => $totalWinnings,
                'created_at' => $user->created_at
            ];
        });

        return view('admin.contest_analysis.users_list', compact('usersData'));
    }

    public function userDetail(Request $request, $userId)
    {
        $user = DB::table('users')->where('id', $userId)->first();

        if (!$user) {
            return redirect()->route('admin.contest-analysis.users')->with('error', 'User not found');
        }

        // User's contests
        $query = DB::table('contest_entries as ce')
            ->leftJoin('contests as c', 'ce.contest_id', '=', 'c.id')
            ->leftJoin('league_sessions as ls', 'c.league_session_id', '=', 'ls.id')
            ->where('ce.user_id', $userId);
        
        // Date filter
        if ($request->filled('from_date')) {
            $query->whereDate('ce.created_at', '>=', $request->from_date);
        }
        
        if ($request->filled('to_date')) {
            $query->whereDate('ce.created_at', '<=', $request->to_date);
        }
        
        $contests = $query->select(
                'c.id as contest_id',
                'c.category',
                'c.entry_fee',
                'ls.name as session_name',
                'ce.rank',
                'ce.total_score',
                'ce.created_at'
            )
            ->orderBy('ce.created_at', 'desc')
            ->get();

        // Add winning amount to each contest
        $contestsData = $contests->map(function($contest) use ($userId) {
            $winning = DB::table('transactions')
                ->where('user_id', $userId)
                ->where('contest_id', $contest->contest_id)
                ->where('type', 'winnings')
                ->value('amount');

            return [
                'contest_id' => $contest->contest_id,
                'session_name' => $contest->session_name,
                'category' => $contest->category,
                'entry_fee' => $contest->entry_fee,
                'rank' => $contest->rank,
                'score' => $contest->total_score,
                'winning' => $winning ?? 0,
                'created_at' => $contest->created_at
            ];
        });

        // Stats
        $stats = [
            'total_contests' => $contests->count(),
            'total_winnings' => $contestsData->sum('winning'),
            'total_spent' => $contests->sum('entry_fee'),
            'net_profit' => $contestsData->sum('winning') - $contests->sum('entry_fee')
        ];

        return view('admin.contest_analysis.user_detail', compact('user', 'contestsData', 'stats'));
    }
}
