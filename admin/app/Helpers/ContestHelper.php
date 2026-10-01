<?php

namespace App\Helpers;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ContestHelper
{
    public static function cancelContestAndRefund($contestId, $reason = 'Technical error')
    {
        try {
            Log::warning("Cancelling contest {$contestId}", ['reason' => $reason]);
            
            DB::table('contests')->where('id', $contestId)->update(['status' => 'cancelled', 'updated_at' => now()]);
            
            $entries = DB::table('contest_entries')->where('contest_id', $contestId)->get();
            $contest = DB::table('contests')->where('id', $contestId)->first();
            $entryFee = floatval($contest->entry_fee ?? 0);
            
            foreach ($entries as $entry) {
                DB::table('users')->where('id', $entry->user_id)->increment('deposit_balance', $entryFee);
                
                $user = DB::table('users')->where('id', $entry->user_id)->first();
                DB::table('users')->where('id', $entry->user_id)->update([
                    'wallet_balance' => ($user->deposit_balance ?? 0) + ($user->winnings_balance ?? 0)
                ]);
                
                DB::table('transactions')->insert([
                    'user_id' => $entry->user_id,
                    'type' => 'deposit',
                    'amount' => $entryFee,
                    'status' => 'success',
                    'description' => "Contest {$contestId} cancelled - Refund",
                    'created_at' => now(),
                    'updated_at' => now()
                ]);
            }
            
            Log::info("Contest {$contestId} cancelled, {$entries->count()} users refunded");
            return true;
            
        } catch (\Exception $e) {
            Log::error("Failed to cancel contest {$contestId}", ['error' => $e->getMessage()]);
            return false;
        }
    }
}
