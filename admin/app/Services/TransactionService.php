<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class TransactionService
{
    public function fixDuplicateTransactions($contestId)
    {
        return DB::transaction(function () use ($contestId) {
            // Step 1: Get duplicate transaction IDs to delete
            $duplicateIds = DB::select("
                SELECT id, amount, user_id FROM (
                    SELECT id, amount, user_id,
                           ROW_NUMBER() OVER (PARTITION BY user_id, transaction_id ORDER BY id) as rn
                    FROM transactions 
                    WHERE transaction_id LIKE 'CONTEST_{$contestId}_%' 
                        AND type = 'winnings'
                        AND status = 'success'
                ) ranked 
                WHERE rn > 1
            ");

            $deleted = 0;
            $totalAmount = 0;

            // Step 2: Refund and delete each duplicate
            foreach ($duplicateIds as $duplicate) {
                // Refund the amount first
                DB::table('users')
                    ->where('id', $duplicate->user_id)
                    ->decrement('winnings_balance', abs($duplicate->amount));
                
                // Delete the duplicate transaction
                DB::table('transactions')
                    ->where('id', $duplicate->id)
                    ->delete();
                
                $deleted++;
                $totalAmount += abs($duplicate->amount);
            }

            return [
                'success' => true,
                'message' => 'Duplicate transactions deleted successfully',
                'deleted_count' => $deleted,
                'total_refunded' => $totalAmount,
                'contest_id' => $contestId
            ];
        });
    }

    public function distributePrizes($contestId)
    {
        $lockKey = "prize_distribution_{$contestId}";
        
        return DB::transaction(function () use ($contestId, $lockKey) {
            // Check if prizes already distributed
            $existing = DB::table('transactions')
                ->where('transaction_id', 'LIKE', "CONTEST_{$contestId}_%")
                ->where('type', 'winnings')
                ->where('status', 'success')
                ->exists();

            if ($existing) {
                return ['message' => 'Prizes already distributed'];
            }

            // Get contest winners
            $winners = DB::table('contest_entries')
                ->join('contests', 'contest_entries.contest_id', '=', 'contests.id')
                ->where('contest_entries.contest_id', $contestId)
                ->orderBy('contest_entries.score', 'desc')
                ->select('contest_entries.*')
                ->get();

            $distributed = 0;
            foreach ($winners as $winner) {
                $transactionId = "CONTEST_{$contestId}_ENTRY_{$winner->id}";
                
                try {
                    // Create unique transaction
                    DB::table('transactions')->insert([
                        'user_id' => $winner->user_id,
                        'transaction_id' => $transactionId,
                        'type' => 'winnings',
                        'amount' => $winner->prize_amount ?? 0,
                        'status' => 'success',
                        'created_at' => now(),
                        'updated_at' => now()
                    ]);

                    // Update wallet
                    DB::table('users')
                        ->where('id', $winner->user_id)
                        ->increment('winnings_balance', $winner->prize_amount ?? 0);
                    
                    $distributed++;
                } catch (\Exception $e) {
                    Log::error("Prize distribution failed for user {$winner->user_id}: " . $e->getMessage());
                }
            }

            return ['success' => true, 'distributed_count' => $distributed];
        });
    }
}