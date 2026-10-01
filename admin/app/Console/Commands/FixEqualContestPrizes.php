<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Contest;

class FixEqualContestPrizes extends Command
{
    protected $signature = 'contest:fix-equal-prizes';
    protected $description = 'Fix prize distribution for equal category contests';

    public function handle()
    {
        $contests = Contest::where('category', 'equal')->get();
        
        $fixed = 0;
        foreach ($contests as $contest) {
            $prizePool = floatval($contest->prize_pool);
            $totalWinners = floor($contest->participants * ($contest->winning_percentage / 100));
            
            if ($totalWinners > 0) {
                $equalDistribution = [[
                    'label' => "Ranks 1-{$totalWinners}",
                    'prize' => $prizePool,
                    'winners' => $totalWinners,
                    'perWinner' => $prizePool / $totalWinners,
                    'percent' => 100
                ]];
                
                $contest->prize_distribution = json_encode($equalDistribution);
                $contest->save();
                
                $this->info("Fixed contest #{$contest->id}: {$totalWinners} winners, {$prizePool} pool, " . round($prizePool / $totalWinners, 2) . " per winner");
                $fixed++;
            }
        }
        
        $this->info("Fixed {$fixed} equal contests");
    }
}
