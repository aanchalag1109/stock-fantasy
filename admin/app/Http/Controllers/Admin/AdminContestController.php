<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Contest;
use App\Models\Asset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminContestController extends Controller
{
    public function dashboard()
    {
        $contests = Contest::orderBy('created_at', 'desc')->paginate(8);
        
        // Add participant count from contest_entries
        $contests->getCollection()->transform(function($contest) {
            $contest->participants_count = DB::table('contest_entries')
                ->where('contest_id', $contest->id)
                ->distinct('user_id')
                ->count('user_id');
            
            // Calculate progress percentage
            $contest->progress_percentage = ($contest->participants && $contest->participants > 0) 
                ? min(100, ($contest->participants_count / $contest->participants) * 100) 
                : 0;
                
            return $contest;
        });

        return view('admin.contests.index', compact('contests'));
    }

    public function show($id)
    {
        $contest = Contest::with('leagueSession')->findOrFail($id);
        
        // Get participants count from contest_entries
        $participantCount = DB::table('contest_entries')
            ->where('contest_id', $contest->id)
            ->count();
        
        // Calculate stats
        $stats = [
            'total_participants' => $participantCount,
            'actual_prize_pool' => $participantCount * $contest->entry_fee * (1 - ($contest->platform_fee ?? 10) / 100),
            'total_entries' => $participantCount
        ];
        
        return view('admin.contests.show', compact('contest', 'stats'));
    }

    public function updateStatus(Request $request, $id)
    {
        $request->validate([
            'status' => 'required|in:upcoming,live,completed'
        ]);

        $contest = Contest::findOrFail($id);
        $contest->update(['status' => $request->status]);

        if ($request->status === 'live') {
            $this->startRealTimeTracking($contest);
        }

        return response()->json([
            'success' => true,
            'message' => 'Contest status updated to ' . strtoupper($request->status)
        ]);
    }

    public function getLiveData($id)
    {
        $contest = Contest::findOrFail($id);

        $participants = DB::table('contest_entries')
            ->leftJoin('users', 'contest_entries.user_id', '=', 'users.id')
            ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
            ->where('contest_entries.contest_id', $id)
            ->select(
                'contest_entries.*',
                'users.name as user_name',
                'saved_baskets.assets',
                'saved_baskets.multipliers'
            )
            ->orderBy('contest_entries.total_score', 'desc')
            ->get();

        $liveAssets = Asset::where('is_active', true)
            ->select('id', 'name', 'sector', 'current_price', 'price_change')
            ->get();

        return response()->json([
            'contest' => $contest,
            'participants' => $participants,
            'live_assets' => $liveAssets,
            'stats' => [
                'total_participants' => $participants->count(),
                'top_score' => $participants->first()->total_score ?? 0,
                'live_assets_count' => $liveAssets->count(),
            ]
        ]);
    }

    private function startRealTimeTracking($contest)
    {
        $entries = DB::table('contest_entries')
            ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
            ->where('contest_entries.contest_id', $contest->id)
            ->select('contest_entries.*', 'saved_baskets.assets', 'saved_baskets.multipliers')
            ->get();
        
        foreach ($entries as $entry) {
            $assets = json_decode($entry->assets, true) ?? [];
            $totalScore = 0;
            
            foreach ($assets as $asset) {
                $points = $this->calculateAssetPoints($asset);
                $totalScore += $points;
            }
            
            DB::table('contest_entries')
                ->where('id', $entry->id)
                ->update(['total_score' => $totalScore]);
        }
        
        $this->updateRanks($contest);
    }

    private function calculateAssetPoints($asset)
    {
        $priceChange = $asset['price_change'] ?? 0;
        $prediction = $asset['prediction'] ?? 'UP';
        
        $basePoints = 100;
        
        if (($prediction === 'UP' && $priceChange > 0) || 
            ($prediction === 'DOWN' && $priceChange < 0)) {
            return $basePoints + (abs($priceChange) * 10);
        }
        
        return max(0, $basePoints - (abs($priceChange) * 5));
    }

    private function updateRanks($contest)
    {
        $entries = DB::table('contest_entries')
            ->where('contest_id', $contest->id)
            ->orderBy('total_score', 'desc')
            ->get();
            
        foreach ($entries as $index => $entry) {
            DB::table('contest_entries')
                ->where('id', $entry->id)
                ->update(['rank' => $index + 1]);
        }
    }

    public function exportParticipants($id)
    {
        $contest = Contest::findOrFail($id);
        
        $participants = DB::table('contest_entries')
            ->leftJoin('users', 'contest_entries.user_id', '=', 'users.id')
            ->where('contest_entries.contest_id', $id)
            ->select(
                'users.name',
                'users.email',
                'contest_entries.total_score',
                'contest_entries.rank'
            )
            ->orderBy('contest_entries.rank')
            ->get();
        
        $filename = "contest_{$id}_participants.csv";
        $headers = [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => "attachment; filename={$filename}",
        ];
        
        $callback = function() use ($participants) {
            $file = fopen('php://output', 'w');
            fputcsv($file, ['Name', 'Email', 'Score', 'Rank']);
            
            foreach ($participants as $participant) {
                fputcsv($file, [
                    $participant->name,
                    $participant->email,
                    $participant->total_score,
                    $participant->rank
                ]);
            }
            
            fclose($file);
        };
        
        return response()->stream($callback, 200, $headers);
    }
    
    public function debugContest($id)
    {
        $contest = DB::table('contests')->where('id', $id)->first();
        $entries = DB::table('contest_entries')->where('contest_id', $id)->get();
        $users = DB::table('users')->get();
        
        return response()->json([
            'contest' => $contest,
            'entries_count' => $entries->count(),
            'entries' => $entries,
            'users_count' => $users->count(),
            'all_contest_entries' => DB::table('contest_entries')->get()
        ]);
    }
    
    public function bulkDelete(Request $request)
    {
        $request->validate([
            'contest_ids' => 'required|array|min:1',
            'contest_ids.*' => 'integer|exists:contests,id'
        ]);
        
        $deleted = 0;
        foreach ($request->contest_ids as $id) {
            $contest = Contest::find($id);
            if ($contest && $contest->status !== 'live') {
                $contest->delete();
                $deleted++;
            }
        }
        
        return redirect()->back()->with('success', "Deleted {$deleted} contests successfully.");
    }
    
    public function create()
    {
        $sessions = \DB::table('league_sessions')->get();
        return view('admin.contests.create', compact('sessions'));
    }

    public function store(Request $request)
    {
        $request->validate([
            'league_session_id' => 'required|exists:league_sessions,id',
            'category' => 'required|in:mega,equal,practice',
            'participants' => 'required|integer|min:1',
            'entry_fee' => 'required|numeric|min:0',
            'platform_fee' => 'required|numeric|min:0|max:100',
            'winning_percentage' => 'required|numeric|min:0|max:100',
            'max_entries_per_user' => 'required|integer|min:1',
            'prize_distribution' => 'required|json'
        ]);

        $totalPool = $request->participants * $request->entry_fee;
        $platformFeeAmount = ($totalPool * $request->platform_fee) / 100;
        $prizePool = $totalPool - $platformFeeAmount;
        $totalWinners = ceil($request->participants * $request->winning_percentage / 100);

        Contest::create([
            'league_session_id' => $request->league_session_id,
            'category' => $request->category,
            'participants' => $request->participants,
            'entry_fee' => $request->entry_fee,
            'platform_fee' => $request->platform_fee,
            'winning_percentage' => $request->winning_percentage,
            'max_entries_per_user' => $request->max_entries_per_user,
            'prize_pool' => $prizePool,
            'total_pool' => $totalPool,
            'platform_fee_amount' => $platformFeeAmount,
            'total_winners' => $totalWinners,
            'prize_distribution' => $request->prize_distribution,
            'status' => 'upcoming'
        ]);

        return redirect()->route('admin.contests.index')->with('success', 'Contest created successfully!');
    }

    public function distributePrizes(Request $request, $id)
    {
        $contest = Contest::findOrFail($id);
        
        if ($contest->status !== 'completed') {
            return response()->json(['error' => 'Contest must be completed first'], 400);
        }

        $winners = DB::table('contest_entries')
            ->where('contest_id', $id)
            ->where('rank', '<=', ceil($contest->participants * $contest->winning_percentage / 100))
            ->orderBy('rank')
            ->get();

        $prizePerWinner = $contest->prize_pool / $winners->count();

        foreach ($winners as $winner) {
            DB::table('contest_entries')
                ->where('id', $winner->id)
                ->update(['prize_amount' => $prizePerWinner]);
        }

        return response()->json(['success' => true, 'message' => 'Prizes distributed successfully']);
    }
}