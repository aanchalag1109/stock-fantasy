<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Exception;

class PrizeDistributionService
{
    /**
     * Distribute prizes with race condition protection
     */
    public function distributePrizes($contestId)
    {
        // 1. LOCK MECHANISM - Prevent simultaneous execution
        $lockKey = "prize_distribution_{$contestId}";
        
        if (Cache::has($lockKey)) {
            Log::warning("Prize distribution already in progress", ['contest_id' => $contestId]);
            return [
                'success' => false, 
                'message' => 'Prize distribution already in progress for this contest'
            ];
        }
        
        // Set lock for 10 minutes
        Cache::put($lockKey, true, 600);
        
        try {
            // 2. DUPLICATE CHECK - Verify not already distributed
            $existingPrizes = DB::table('transactions')
                ->where('contest_id', $contestId)
                ->where('type', 'winnings')
                ->count();
                
            if ($existingPrizes > 0) {
                Log::info("Prizes already distributed", [
                    'contest_id' => $contestId,
                    'existing_count' => $existingPrizes
                ]);
                return [
                    'success' => false,
                    'message' => "Prizes already distributed ({$existingPrizes} transactions exist)"
                ];
            }
            
            // 3. GET CONTEST AND WINNERS
            $contest = DB::table('contests')->where('id', $contestId)->first();
            if (!$contest) {
                throw new Exception("Contest {$contestId} not found");
            }
            
            $winners = $this->getContestWinners($contestId);
            if (empty($winners)) {
                return [
                    'success' => false,
                    'message' => 'No winners found for this contest'
                ];
            }
            
            // 4. DISTRIBUTE WITH TRANSACTION PROTECTION
            DB::beginTransaction();
            
            $totalDistributed = 0;
            $transactionsCreated = 0;
            
            foreach ($winners as $winner) {
                // Double-check no duplicate exists for this specific winner
                $existingWinnerPrize = DB::table('transactions')
                    ->where('contest_id', $contestId)
                    ->where('user_id', $winner['user_id'])
                    ->where('type', 'winnings')
                    ->where('description', 'like', "%entry {$winner['entry_id']}%")
                    ->first();
                    
                if ($existingWinnerPrize) {
                    Log::warning("Skipping duplicate prize", [
                        'contest_id' => $contestId,
                        'user_id' => $winner['user_id'],
                        'entry_id' => $winner['entry_id']
                    ]);
                    continue;
                }
                
                // Create unique transaction
                $transactionId = 'PRIZE_' . $contestId . '_ENTRY_' . $winner['entry_id'] . '_' . time() . '_' . rand(1000, 9999);
                
                $transactionData = [
                    'user_id' => $winner['user_id'],
                    'contest_id' => $contestId,
                    'type' => 'winnings',
                    'amount' => $winner['prize_amount'],
                    'status' => 'success', // ALWAYS SUCCESS
                    'transaction_id' => $transactionId,
                    'description' => "Prize for Contest #{$contestId}, entry {$winner['entry_id']}, rank {$winner['rank']}",
                    'created_at' => now(),
                    'updated_at' => now()
                ];
                
                DB::table('transactions')->insert($transactionData);
                
                // Update user wallet
                DB::table('users')
                    ->where('id', $winner['user_id'])
                    ->increment('winnings_balance', $winner['prize_amount']);
                
                $totalDistributed += $winner['prize_amount'];
                $transactionsCreated++;
                
                Log::info("Prize distributed", [
                    'contest_id' => $contestId,
                    'user_id' => $winner['user_id'],
                    'amount' => $winner['prize_amount'],
                    'rank' => $winner['rank']
                ]);
            }
            
            DB::commit();
            
            return [
                'success' => true,
                'message' => "Prizes distributed successfully",
                'total_winners' => $transactionsCreated,
                'total_amount' => $totalDistributed,
                'contest_id' => $contestId
            ];
            
        } catch (Exception $e) {
            DB::rollBack();
            Log::error("Prize distribution failed", [
                'contest_id' => $contestId,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            
            return [
                'success' => false,
                'message' => 'Prize distribution failed: ' . $e->getMessage()
            ];
            
        } finally {
            // Always release lock
            Cache::forget($lockKey);
        }
    }
    
    /**
     * Get contest winners with proper ranking
     */
    private function getContestWinners($contestId)
    {
        // Get contest details
        $contest = DB::table('contests')->where('id', $contestId)->first();
        if (!$contest) return [];
        
        // Get participants sorted by score
        $participants = DB::table('contest_entries')
            ->where('contest_id', $contestId)
            ->orderBy('total_score', 'desc')
            ->get();
            
        if ($participants->isEmpty()) return [];
        
        // Get prize distribution
        $prizeDistribution = DB::table('contest_performance_prizes')
            ->where('contest_id', $contestId)
            ->orderBy('rank_start')
            ->get();
            
        if ($prizeDistribution->isEmpty()) return [];
        
        $winners = [];
        $currentRank = 1;
        $previousScore = null;
        
        foreach ($participants as $index => $participant) {
            // Handle tied scores
            if ($previousScore !== null && $participant->total_score == $previousScore) {
                // Same rank as previous
            } else {
                $currentRank = $index + 1;
            }
            
            // Find prize for this rank
            $prizeAmount = 0;
            foreach ($prizeDistribution as $prize) {
                if ($currentRank >= $prize->rank_start && $currentRank <= $prize->rank_end) {
                    $prizeAmount = $prize->per_winner_amount;
                    break;
                }
            }
            
            if ($prizeAmount > 0) {
                $winners[] = [
                    'user_id' => $participant->user_id,
                    'entry_id' => $participant->id,
                    'rank' => $currentRank,
                    'score' => $participant->total_score,
                    'prize_amount' => $prizeAmount
                ];
            }
            
            $previousScore = $participant->total_score;
        }
        
        return $winners;
    }
}