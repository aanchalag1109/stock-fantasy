<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class ContestTrackingController extends Controller
{
    public function index()
    {
        $contests = DB::table('contests')
            ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
            ->select(
                'contests.*',
                'league_sessions.name as session_name',
                'league_sessions.market_type'
            )
            ->orderBy('contests.start_time', 'desc')
            ->paginate(20);

        return view('admin.contest_tracking.index', compact('contests'));
    }

    public function show($id)
    {
        $contest = DB::table('contests')
            ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
            ->select(
                'contests.*',
                'league_sessions.name as session_name',
                'league_sessions.market_type'
            )
            ->where('contests.id', $id)
            ->first();

        if (!$contest) {
            return redirect()->back()->with('error', 'Contest not found');
        }

        // Get start prices
        $startPrices = DB::table('contest_start_prices')
            ->where('contest_id', $id)
            ->get();

        // Get end prices
        $endPrices = DB::table('contest_end_prices')
            ->where('contest_id', $id)
            ->get();

        // Get results
        $results = DB::table('contest_results')
            ->leftJoin('users', 'contest_results.user_id', '=', 'users.id')
            ->leftJoin('saved_baskets', 'contest_results.basket_id', '=', 'saved_baskets.id')
            ->select(
                'contest_results.*',
                'users.name as user_name',
                'users.mobile as user_mobile'
            )
            ->where('contest_results.contest_id', $id)
            ->orderBy('contest_results.rank')
            ->get();

        // Get participants
        $participants = DB::table('saved_baskets')
            ->leftJoin('users', 'saved_baskets.user_id', '=', 'users.id')
            ->select(
                'saved_baskets.*',
                'users.name as user_name',
                'users.mobile as user_mobile'
            )
            ->where('saved_baskets.contest_id', $id)
            ->get();

        return view('admin.contest_tracking.show', compact(
            'contest', 'startPrices', 'endPrices', 'results', 'participants'
        ));
    }

    public function startContest(Request $request, $id)
    {
        try {
            $response = Http::post(url('/api/contest-start-prices'), [
                'contest_id' => $id,
                'timestamp' => now()->toISOString()
            ]);

            if ($response->successful()) {
                return redirect()->back()->with('success', 'Contest started and prices saved successfully');
            } else {
                return redirect()->back()->with('error', 'Failed to start contest: ' . $response->body());
            }
        } catch (\Exception $e) {
            return redirect()->back()->with('error', 'Error starting contest: ' . $e->getMessage());
        }
    }

    public function endContest(Request $request, $id)
    {
        try {
            // Save end prices
            $response1 = Http::post(url('/api/contest-end-prices'), [
                'contest_id' => $id,
                'timestamp' => now()->toISOString()
            ]);

            if (!$response1->successful()) {
                return redirect()->back()->with('error', 'Failed to save end prices: ' . $response1->body());
            }

            // Calculate results
            $response2 = Http::post(url('/api/calculate-contest-results'), [
                'contest_id' => $id
            ]);

            if ($response2->successful()) {
                return redirect()->back()->with('success', 'Contest ended and results calculated successfully');
            } else {
                return redirect()->back()->with('error', 'Failed to calculate results: ' . $response2->body());
            }
        } catch (\Exception $e) {
            return redirect()->back()->with('error', 'Error ending contest: ' . $e->getMessage());
        }
    }

    public function getLiveContests()
    {
        $contests = DB::table('contests')
            ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
            ->select(
                'contests.id',
                'contests.category',
                'contests.prize_pool',
                'contests.status',
                'contests.start_time',
                'contests.end_time',
                'league_sessions.name as session_name'
            )
            ->where('contests.status', 'live')
            ->get();

        return response()->json(['contests' => $contests]);
    }

    public function getContestStats($id)
    {
        $participants = DB::table('saved_baskets')
            ->where('contest_id', $id)
            ->count();

        $hasStartPrices = DB::table('contest_start_prices')
            ->where('contest_id', $id)
            ->exists();

        $hasEndPrices = DB::table('contest_end_prices')
            ->where('contest_id', $id)
            ->exists();

        $hasResults = DB::table('contest_results')
            ->where('contest_id', $id)
            ->exists();

        return response()->json([
            'participants' => $participants,
            'has_start_prices' => $hasStartPrices,
            'has_end_prices' => $hasEndPrices,
            'has_results' => $hasResults
        ]);
    }
}