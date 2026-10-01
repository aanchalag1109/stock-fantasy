<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use App\Models\User; 
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;


class WalletController extends Controller
{
    

   public function getWalletAmount(Request $request)
    {
        try {
            $userId = $request->query('user_id');
            $user = null;

            if ($userId) {
                $user = User::find($userId); // Corrected: use User model
                if (!$user) {
                    return response()->json(['error' => 'User not found'], 404);
                }
            } else {
                // If no user_id is provided, assume authenticated user.
                // Assuming Laravel's Auth facade is available and configured.
                $user = auth()->user();
                if (!$user) {
                    return response()->json(['error' => 'Unauthorized or user_id not provided'], 401);
                }
            }
            return response()->json([
                'wallet_balance' => floatval($user->deposit_balance ?? 0) + floatval($user->winnings_balance ?? 0),
                'deposit_balance' => floatval($user->deposit_balance ?? 0),
                'winnings_balance' => floatval($user->winnings_balance ?? 0),
                'unread_notifications' => \App\Http\Controllers\Api\NotificationController::getUnreadCount($user->id),
            ]);
        } catch (\Exception $e) {
            Log::error('Error fetching wallet amount: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to fetch wallet amount'], 500);
        }
    }



       public function getUserTransactions(Request $request)
    {
        try {
            $request->validate([
                'user_id' => 'required|integer|exists:users,id',
            ]);
            
            $userId = $request->input('user_id');
            
            $transactions = DB::table('transactions')
                ->where('user_id', $userId)
                ->orderByDesc('created_at')
                ->get();
            
            // Process each transaction to add contest_name and basket_serial_no
            $transactions = $transactions->map(function($transaction) {
                $contestId = $transaction->contest_id;
                $entryId = null;
                
                // If contest_id is null, try to parse from transaction_id (old format)
                if (!$contestId && $transaction->transaction_id) {
                    // Parse: CONTEST_276_ENTRY_408
                    if (preg_match('/CONTEST_(\d+)_ENTRY_(\d+)/', $transaction->transaction_id, $matches)) {
                        $contestId = $matches[1];
                        $entryId = $matches[2];
                    }
                }
                
                // Fetch contest name and basket serial_no if contest_id exists
                if ($contestId) {
                    // Get contest name from league_sessions
                    $contest = DB::table('contests')
                        ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
                        ->where('contests.id', $contestId)
                        ->select('league_sessions.name as session_name')
                        ->first();
                    
                    $transaction->contest_name = $contest->session_name ?? null;
                    
                    // Get basket serial_no from contest_entries
                    if ($entryId) {
                        // Old format: use entry_id from transaction_id
                        $entry = DB::table('contest_entries')
                            ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
                            ->where('contest_entries.id', $entryId)
                            ->select('saved_baskets.serial_no')
                            ->first();
                    } else {
                        // New format: find entry by contest_id and user_id
                        $entry = DB::table('contest_entries')
                            ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
                            ->where('contest_entries.contest_id', $contestId)
                            ->where('contest_entries.user_id', $transaction->user_id)
                            ->select('saved_baskets.serial_no')
                            ->first();
                    }
                    
                    $transaction->basket_serial_no = $entry->serial_no ?? null;
                } else {
                    $transaction->contest_name = null;
                    $transaction->basket_serial_no = null;
                }
                
                return $transaction;
            });
                
            return response()->json([
                'transactions' => $transactions
            ]);
        } catch (\Exception $e) {
            Log::error('Error fetching user transactions: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to fetch transactions'], 500);
        }
    }



     public function depositAmount(Request $request)
    {
        try {
            $request->validate([
                'user_id' => 'required|integer|exists:users,id',
                'wallet_balance' => 'required|numeric|min:0', // Renamed to 'amount' for clarity
            ]);

            $userId = $request->input('user_id');
            $amount = floatval($request->input('wallet_balance')); // Using wallet_balance as amount to deposit
            
            return DB::transaction(function () use ($userId, $amount) { // Use transaction for atomicity
                $user = User::find($userId); // Corrected: use User model
                if (!$user) {
                    return response()->json([
                        'success' => false,
                        'error' => 'User not found'
                    ], 404);
                }
                
                // Update deposit balance using Eloquent model
                $user->deposit_balance = floatval($user->deposit_balance ?? 0) + $amount;
                $user->save();
                
                // Create transaction record
                DB::table('transactions')->insert([ // Corrected: use DB facade
                    'user_id' => $userId,
                    'type' => 'deposit',
                    'amount' => $amount,
                    'description' => 'Manual deposit', // Add a description for manual deposits
                    'created_at' => Carbon::now(), // Corrected: use Carbon
                    'updated_at' => Carbon::now(), // Corrected: use Carbon
                ]);
                
                return response()->json([
                    'success' => true,
                    'wallet_balance' => floatval($user->deposit_balance) + floatval($user->winnings_balance ?? 0),
                    'deposit_balance' => floatval($user->deposit_balance),
                    'winnings_balance' => floatval($user->winnings_balance ?? 0),
                    'unread_notifications' => \App\Http\Controllers\Api\NotificationController::getUnreadCount($userId),
                ]);
            });
        } catch (\Exception $e) {
            Log::error('Deposit amount failed: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'error' => 'Server error: ' . $e->getMessage(),
                'errors' => $e instanceof \Illuminate\Validation\ValidationException ? $e->errors() : null
            ], 500);
        }
    }




     public function withdrawAmount(Request $request)
    {
        try {
            $request->validate([
                'user_id' => 'required|integer|exists:users,id',
                'amount'  => 'required|numeric|min:500', // Minimum 500 coins
                'message' => 'nullable|string'
            ]);

            return DB::transaction(function () use ($request) {
                $user           = User::lockForUpdate()->find($request->input('user_id'));
                $withdrawAmount = floatval($request->input('amount'));

                // Check USDT wallet details
                $paymentDetails = DB::table('user_payment_details')
                    ->where('user_id', $user->id)
                    ->first();

                if (!$paymentDetails || empty($paymentDetails->usdt_wallet_address)) {
                    return response()->json([
                        'success'                  => false,
                        'error'                    => 'Please add your USDT wallet address before withdrawing.',
                        'payment_details_required' => true
                    ], 400);
                }

                $userWinningsBalance = floatval($user->winnings_balance ?? 0);

                if ($userWinningsBalance < $withdrawAmount) {
                    return response()->json([
                        'success'          => false,
                        'error'            => 'Insufficient winnings balance. Only winnings can be withdrawn.',
                        'winnings_balance' => $userWinningsBalance
                    ], 400);
                }

                // Deduct from winnings balance
                $user->winnings_balance = $userWinningsBalance - $withdrawAmount;
                $user->save();

                // Create withdrawal request with USDT details
                $withdrawalId = DB::table('withdrawal_requests')->insertGetId([
                    'user_id'              => $user->id,
                    'amount'               => $withdrawAmount,
                    'status'               => 'pending',
                    'message'              => $request->input('message'),
                    'usdt_wallet_address'  => $paymentDetails->usdt_wallet_address,
                    'usdt_network'         => $paymentDetails->usdt_network ?? 'TRC20',
                    'created_at'           => Carbon::now(),
                    'updated_at'           => Carbon::now(),
                ]);

                // Transaction record
                DB::table('transactions')->insert([
                    'user_id'     => $user->id,
                    'type'        => 'withdrawal',
                    'amount'      => $withdrawAmount,
                    'description' => 'Withdrawal request #' . $withdrawalId . ' (USDT ' . ($paymentDetails->usdt_network ?? 'TRC20') . ')',
                    'created_at'  => Carbon::now(),
                    'updated_at'  => Carbon::now(),
                ]);

                return response()->json([
                    'success'          => true,
                    'withdrawal_id'    => $withdrawalId,
                    'message'          => 'Withdrawal request submitted. Admin will process it shortly.',
                    'wallet_balance'   => floatval($user->deposit_balance ?? 0) + floatval($user->winnings_balance),
                    'deposit_balance'  => floatval($user->deposit_balance ?? 0),
                    'winnings_balance' => floatval($user->winnings_balance),
                    'usdt_address'     => $paymentDetails->usdt_wallet_address,
                    'usdt_network'     => $paymentDetails->usdt_network ?? 'TRC20',
                    'unread_notifications' => \App\Http\Controllers\Api\NotificationController::getUnreadCount($user->id),
                ]);
            });
        } catch (\Exception $e) {
            Log::error('Error creating withdrawal request: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'error'   => 'Failed to create withdrawal request: ' . $e->getMessage()
            ], 500);
        }
    }



}