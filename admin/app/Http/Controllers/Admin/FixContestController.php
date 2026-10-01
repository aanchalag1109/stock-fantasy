<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Contest;

class FixContestController extends Controller
{
    public function fixEqualPrizes()
    {
        $contests = Contest::where('category', 'equal')->get();
        
        $fixed = [];
        foreach ($contests as $contest) {
            $prizePool = floatval($contest->prize_pool);
            $totalWinners = floor($contest->participants * ($contest->winning_percentage / 100));
            
            if ($totalWinners > 0) {
                $oldDistribution = json_decode($contest->prize_distribution, true);
                
                $equalDistribution = [[
                    'label' => "Ranks 1-{$totalWinners}",
                    'prize' => $prizePool,
                    'winners' => $totalWinners,
                    'perWinner' => round($prizePool / $totalWinners, 2),
                    'percent' => 100
                ]];
                
                $contest->prize_distribution = json_encode($equalDistribution);
                $contest->save();
                
                $fixed[] = [
                    'contest_id' => $contest->id,
                    'old' => $oldDistribution,
                    'new' => $equalDistribution
                ];
            }
        }
        
        return response()->json([
            'success' => true,
            'message' => 'Fixed ' . count($fixed) . ' equal contests',
            'fixed' => $fixed
        ]);
    }
}
