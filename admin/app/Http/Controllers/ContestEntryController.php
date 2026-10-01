<?php

namespace App\Http\Controllers;

use App\Models\ContestEntry;
use App\Models\Contest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ContestEntryController extends Controller
{
    public function joinContest(Request $request)
    {
        $request->validate([
            'contest_id' => 'required|exists:contests,id',
            'selected_stocks' => 'required|array|size:6',
            'selected_stocks.*.name' => 'required|string',
            'selected_stocks.*.multiplier' => 'required|in:1,1.5,2',
            'spots_count' => 'required|integer|min:1', // New spots count parameter
        ]);

        $contest = Contest::findOrFail($request->contest_id);
        $spotsCount = $request->spots_count;
        
        // Check if user already joined
        $existingEntry = ContestEntry::where('user_id', Auth::id())
            ->where('contest_id', $contest->id)
            ->first();
            
        if ($existingEntry) {
            return response()->json(['error' => 'Already joined this contest'], 400);
        }

        // Validate multiplier rules (1 superstar=2x, 1 star=1.5x, 4 normal=1x)
        $multipliers = collect($request->selected_stocks)->pluck('multiplier');
        if ($multipliers->filter(fn($m) => $m == 2)->count() != 1 ||
            $multipliers->filter(fn($m) => $m == 1.5)->count() != 1 ||
            $multipliers->filter(fn($m) => $m == 1)->count() != 4) {
            return response()->json(['error' => 'Invalid multiplier selection'], 400);
        }

        $entry = ContestEntry::create([
            'user_id' => Auth::id(),
            'contest_id' => $contest->id,
            'entry_fee' => $contest->entry_fee * $spotsCount, // Multiply entry fee by spots
            'spots_count' => $spotsCount, // Store spots count
            'selected_stocks' => $request->selected_stocks,
        ]);

        // Update contest entries count by spots count
        $contest->increment('entries_count', $spotsCount);

        return response()->json([
            'message' => 'Successfully joined contest', 
            'entry' => $entry,
            'spots_joined' => $spotsCount,
            'total_entry_fee' => $contest->entry_fee * $spotsCount
        ]);
    }

    public function calculatePoints(Request $request)
    {
        $request->validate([
            'contest_id' => 'required|exists:contests,id',
            'stock_prices' => 'required|array',
        ]);

        $contest = Contest::findOrFail($request->contest_id);
        $entries = $contest->entries()->with('user')->get();

        foreach ($entries as $entry) {
            $totalPoints = 0;
            
            foreach ($entry->selected_stocks as $stock) {
                $priceData = $request->stock_prices[$stock['name']] ?? null;
                if (!$priceData) continue;

                $percentChange = $priceData['percent_change'];
                $points = $percentChange * 10; // 1% = 10 points
                $points *= $stock['multiplier']; // Apply multiplier
                
                $totalPoints += $points;
            }

            $entry->update(['total_points' => $totalPoints]);
        }

        // Calculate rankings
        $this->calculateRankings($contest->id);

        return response()->json(['message' => 'Points calculated successfully']);
    }

    private function calculateRankings($contestId)
    {
        $entries = ContestEntry::where('contest_id', $contestId)
            ->orderBy('total_points', 'desc')
            ->get();

        foreach ($entries as $index => $entry) {
            $entry->update(['rank' => $index + 1]);
        }

        // Calculate prize distribution
        $this->distributePrizes($contestId);
    }

    private function distributePrizes($contestId)
    {
        $contest = Contest::findOrFail($contestId);
        $prizePool = $contest->calculatePrizePool();
        $entries = $contest->entries()->orderBy('rank')->get();
        
        $totalEntries = $entries->count();
        $winnersCount = ceil($totalEntries * 0.2); // Top 20% winners

        $prizeStructure = [
            1 => 0.25, // 25% for rank 1
            2 => 0.15, // 15% for rank 2
            3 => 0.10, // 10% for rank 3
        ];

        foreach ($entries->take($winnersCount) as $entry) {
            $winningPercentage = $prizeStructure[$entry->rank] ?? 0.05;
            $winnings = $prizePool * $winningPercentage;
            
            $entry->update(['winnings' => $winnings]);
        }
    }

    public function getLeaderboard($contestId)
    {
        $entries = ContestEntry::where('contest_id', $contestId)
            ->with('user')
            ->orderBy('rank')
            ->get();

        return response()->json(['leaderboard' => $entries]);
    }
}