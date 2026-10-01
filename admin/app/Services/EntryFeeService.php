<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Exception;

class EntryFeeService
{
    /**
     * Process contest entry fee with correct calculation
     */
    public function processEntryFee($userId, $contestId, $entryId)
    {
        try {
            // Get contest details
            $contest = DB::table('contests')->where('id', $contestId)->first();
            if (!$contest) {
                throw new Exception("Contest {$contestId} not found");
            }
            
            // Check for existing entry fee transaction
            $existingTransaction = DB::table('transactions')
                ->where('user_id', $userId)
                ->where('contest_id', $contestId)
                ->where('type', 'contest_entry')
                ->where('description', 'like', "%entry {$entryId}%")
                ->first();
                
            if ($existingTransaction) {
                Log::warning("Entry fee already processed", [
                    'user_id' => $userId,
                    'contest_id' => $contestId,
                    'entry_id' => $entryId,
                    'existing_transaction_id' => $existingTransaction->id
                ]);
                return [
                    'success' => false,
                    'message' => 'Entry fee already processed for this entry'
                ];
            }
            
            // CORRECT CALCULATION: Always use fixed entry fee amount
            $entryFeeAmount = floatval($contest->entry_fee); // FIXED AMOUNT, NOT MULTIPLIED
            
            // Create unique transaction ID
            $transactionId = 'ENTRY_' . $contestId . '_' . $entryId . '_' . time() . '_' . rand(1000, 9999);
            
            DB::beginTransaction();
            
            // Create transaction with CORRECT amount and SUCCESS status
            $transactionData = [
                'user_id' => $userId,
                'contest_id' => $contestId,
                'type' => 'contest_entry',
                'amount' => $entryFeeAmount, // CORRECT: Fixed amount
                'status' => 'success', // CORRECT: Success status immediately
                'transaction_id' => $transactionId,
                'description' => "Entry fee for Contest #{$contestId}, entry {$entryId}",
                'created_at' => now(),
                'updated_at' => now()
            ];
            
            $transactionDbId = DB::table('transactions')->insertGetId($transactionData);
            
            // Deduct from user's deposit balance
            $user = DB::table('users')->where('id', $userId)->first();
            if (!$user || $user->deposit_balance < $entryFeeAmount) {
                throw new Exception("Insufficient balance. Required: {$entryFeeAmount}, Available: " . ($user->deposit_balance ?? 0));
            }
            
            DB::table('users')
                ->where('id', $userId)
                ->decrement('deposit_balance', $entryFeeAmount);
            
            DB::commit();
            
            Log::info("Entry fee processed successfully", [
                'transaction_id' => $transactionDbId,
                'user_id' => $userId,
                'contest_id' => $contestId,
                'entry_id' => $entryId,
                'amount' => $entryFeeAmount
            ]);
            
            return [
                'success' => true,
                'transaction_id' => $transactionDbId,
                'amount' => $entryFeeAmount,
                'message' => 'Entry fee processed successfully'
            ];
            
        } catch (Exception $e) {
            DB::rollBack();
            Log::error("Entry fee processing failed", [
                'user_id' => $userId,
                'contest_id' => $contestId,
                'entry_id' => $entryId,
                'error' => $e->getMessage()
            ]);
            
            return [
                'success' => false,
                'message' => 'Entry fee processing failed: ' . $e->getMessage()
            ];
        }
    }
    
    /**
     * Fix existing wrong entry fee amounts
     */
    public function fixWrongEntryFees($contestId)
    {
        try {
            $contest = DB::table('contests')->where('id', $contestId)->first();
            if (!$contest) {
                throw new Exception("Contest {$contestId} not found");
            }
            
            $correctAmount = floatval($contest->entry_fee);
            
            // Find wrong entry fee transactions
            $wrongTransactions = DB::table('transactions')
                ->where('contest_id', $contestId)
                ->where('type', 'contest_entry')
                ->where('amount', '!=', $correctAmount)
                ->get();
                
            if ($wrongTransactions->isEmpty()) {
                return [
                    'success' => true,
                    'message' => 'No wrong entry fees found',
                    'fixed_count' => 0
                ];
            }
            
            DB::beginTransaction();
            
            $fixedCount = 0;
            $totalCorrected = 0;
            
            foreach ($wrongTransactions as $transaction) {
                $wrongAmount = $transaction->amount;
                $difference = $wrongAmount - $correctAmount;
                
                // Update transaction to correct amount
                DB::table('transactions')
                    ->where('id', $transaction->id)
                    ->update([
                        'amount' => $correctAmount,
                        'status' => 'success', // Also fix status
                        'description' => $transaction->description . ' - AMOUNT CORRECTED',
                        'updated_at' => now()
                    ]);
                
                // Refund the overcharged amount to user
                if ($difference > 0) {
                    DB::table('users')
                        ->where('id', $transaction->user_id)
                        ->increment('deposit_balance', $difference);
                }
                
                $fixedCount++;
                $totalCorrected += $difference;
                
                Log::info("Fixed wrong entry fee", [
                    'transaction_id' => $transaction->id,
                    'user_id' => $transaction->user_id,
                    'old_amount' => $wrongAmount,
                    'new_amount' => $correctAmount,
                    'refunded' => $difference
                ]);
            }
            
            DB::commit();
            
            return [
                'success' => true,
                'message' => "Fixed {$fixedCount} wrong entry fees",
                'fixed_count' => $fixedCount,
                'total_refunded' => $totalCorrected
            ];
            
        } catch (Exception $e) {
            DB::rollBack();
            Log::error("Failed to fix wrong entry fees", [
                'contest_id' => $contestId,
                'error' => $e->getMessage()
            ]);
            
            return [
                'success' => false,
                'message' => 'Failed to fix entry fees: ' . $e->getMessage()
            ];
        }
    }
}