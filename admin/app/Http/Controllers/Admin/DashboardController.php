<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Contest;
use App\Models\KycSubmission;
use App\Models\SavedBasket;
use App\Models\Transaction;
use App\Models\Ticket;
use App\Models\Announcement;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        $start = $request->start_date;
        $end = $request->end_date;

        // Check Cron Status
        $lastRun = Cache::get('cron_last_run');
        $cronStatus = [
            'is_running' => $lastRun && Carbon::parse($lastRun)->gt(now()->subMinutes(3)),
            'last_run' => $lastRun ? Carbon::parse($lastRun)->diffForHumans() : 'Never'
        ];

        $userCount = User::when($start && $end, fn($q) => $q->whereBetween('created_at', [$start, $end . ' 23:59:59']))->count();
        $contestCount = Contest::leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
            ->where('league_sessions.status', '!=', 'completed')
            ->when($start && $end, fn($q) => $q->whereBetween('contests.created_at', [$start, $end . ' 23:59:59']))
            ->count();
        $withdrawalRequestCount = \App\Models\WithdrawalRequest::where('status', 'pending')
            ->when($start && $end, fn($q) => $q->whereBetween('created_at', [$start, $end . ' 23:59:59']))
            ->count();
        $upcomingSessionCount = \App\Models\LeagueSession::where('status', 'upcoming')
            ->when($start && $end, fn($q) => $q->whereBetween('created_at', [$start, $end . ' 23:59:59']))
            ->count();
        $kycPendingCount = KycSubmission::where('status', 'pending')
            ->when($start && $end, fn($q) => $q->whereBetween('created_at', [$start, $end . ' 23:59:59']))
            ->count();
        $totalEntries = \App\Models\SavedBasket::when($start && $end, fn($q) => $q->whereBetween('created_at', [$start, $end . ' 23:59:59']))->count();
        $totalWalletBalance = User::when($start && $end, fn($q) => $q->whereBetween('created_at', [$start, $end . ' 23:59:59']))->sum(DB::raw('deposit_balance + winnings_balance'));
        $openTicketsCount = Ticket::where('status', '!=', 'closed')
            ->when($start && $end, fn($q) => $q->whereBetween('created_at', [$start, $end . ' 23:59:59']))
            ->count();
        $activeAnnouncementsCount = Announcement::where('end_date', '>=', now())
            ->when($start && $end, fn($q) => $q->whereBetween('created_at', [$start, $end . ' 23:59:59']))
            ->count();

        $recentTransactions = Transaction::with('user')
            ->when($start && $end, fn($q) => $q->whereBetween('created_at', [$start, $end . ' 23:59:59']))
            ->latest()
            ->paginate(5);

        $recentContests = Contest::withCount(['savedBaskets' => function($query) {
                $query->whereNotNull('contest_id');
            }])
            ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
            ->when($request->contest_status, fn($q) => $q->where('league_sessions.status', $request->contest_status))
            ->when($start && $end, fn($q) => $q->whereBetween('contests.created_at', [$start, $end . ' 23:59:59']))
            ->select('contests.*')
            ->latest('contests.created_at')
            ->take(10)
            ->get()
            ->map(function ($contest) {
                $contest->start_time = \Carbon\Carbon::parse($contest->start_time);
                $contest->end_time = \Carbon\Carbon::parse($contest->end_time);
                $contest->participants_count = $contest->saved_baskets_count;
                return $contest;
            });

        $recentUsers = User::when($start && $end, fn($q) => $q->whereBetween('created_at', [$start, $end . ' 23:59:59']))
            ->latest()
            ->take(10)
            ->get();

        $recentActivities = $this->getRecentActivities();
        $databaseStatus = 'Operational';
        $serverLoad = rand(10, 50);
        $apiResponseTime = rand(50, 200);
        $lastBackup = null;

        return view('admin.dashboard', compact(
            'userCount', 'contestCount', 'withdrawalRequestCount', 'upcomingSessionCount', 'kycPendingCount', 'totalWalletBalance',
            'totalEntries', 'openTicketsCount', 'activeAnnouncementsCount',
            'recentTransactions', 'recentContests', 'recentActivities', 'recentUsers',
            'databaseStatus', 'serverLoad', 'apiResponseTime', 'lastBackup', 'cronStatus'
        ));
    }

    /**
     * Generate recent activities for the dashboard
     *
     * @return array
     */
    private function getRecentActivities()
    {
        $activities = [];
        $now = now();

        // Get recent user signups (last 5)
        $recentUsers = User::latest()->take(3)->get();
        foreach ($recentUsers as $user) {
            $activities[] = [
                'icon' => 'user-plus',
                'title' => 'New user registered',
                'description' => $user->name . ' joined the platform',
                'time' => $user->created_at->diffForHumans()
            ];
        }

        // Get recent KYC submissions
        $recentKyc = KycSubmission::with('user')
            ->latest()
            ->take(2)
            ->get();

        foreach ($recentKyc as $kyc) {
            $activities[] = [
                'icon' => 'id-card',
                'title' => 'New KYC submission',
                'description' => $kyc->user->name . ' submitted KYC for verification',
                'time' => $kyc->created_at->diffForHumans()
            ];
        }

        // Get recent contests
        $recentContest = Contest::latest()->first();
        if ($recentContest) {
            $activities[] = [
                'icon' => 'trophy',
                'title' => 'New contest created',
                'description' => 'Contest "' . $recentContest->name . '" has been created',
                'time' => $recentContest->created_at->diffForHumans()
            ];
        }

        // Sort activities by time (newest first)
        usort($activities, function($a, $b) {
            return strtotime($b['time']) - strtotime($a['time']);
        });

        // Return only the 5 most recent activities
        return array_slice($activities, 0, 5);
    }
}
