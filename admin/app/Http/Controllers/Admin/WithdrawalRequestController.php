<?php
namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\WithdrawalRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class WithdrawalRequestController extends Controller
{
    public function index()
    {
        $requests = WithdrawalRequest::with('user')->orderByDesc('created_at')->paginate(20);
        return view('admin.withdrawal_requests.index', compact('requests'));
    }

    public function show($id)
    {
        $request = WithdrawalRequest::with('user')->findOrFail($id);
        return view('admin.withdrawal_requests.show', compact('request'));
    }

    public function update(Request $request, $id)
    {
        try {
            $withdrawal = WithdrawalRequest::findOrFail($id);

            $request->validate([
                'status'        => 'required|in:accepted,rejected',
                'admin_message' => 'nullable|string|max:500',
            ]);

            if ($withdrawal->status !== 'pending') {
                return redirect()->back()->with('error', 'This request has already been processed.');
            }

            $oldStatus = $withdrawal->status;

            DB::transaction(function () use ($withdrawal, $request, $oldStatus) {
                // Update withdrawal status
                $withdrawal->status        = $request->status;
                $withdrawal->admin_message = $request->admin_message;
                $withdrawal->save();

                // Refund to user's winnings balance if REJECTED
                if ($request->status === 'rejected') {
                    // Increment winnings_balance only (no wallet_balance column)
                    DB::table('users')
                        ->where('id', $withdrawal->user_id)
                        ->increment('winnings_balance', floatval($withdrawal->amount));

                    // Create refund transaction
                    DB::table('transactions')->insert([
                        'user_id'     => $withdrawal->user_id,
                        'type'        => 'refund',
                        'amount'      => floatval($withdrawal->amount),
                        'status'      => 'success',
                        'description' => 'Withdrawal #' . $withdrawal->id . ' rejected — amount refunded' .
                                         ($request->admin_message ? ': ' . $request->admin_message : ''),
                        'created_at'  => now(),
                        'updated_at'  => now(),
                    ]);

                    Log::info("Withdrawal #{$withdrawal->id} rejected — refunded {$withdrawal->amount} to user #{$withdrawal->user_id}");
                } else {
                    // Accepted — just log it
                    Log::info("Withdrawal #{$withdrawal->id} accepted — admin will send USDT manually");
                }
            });

            $msg = $request->status === 'accepted'
                ? 'Withdrawal accepted. Please send USDT to user\'s wallet.'
                : 'Withdrawal rejected. Amount refunded to user wallet.';

            return redirect()->route('admin.withdrawal_requests.index')->with('success', $msg);

        } catch (\Exception $e) {
            Log::error('Withdrawal update failed: ' . $e->getMessage());
            return redirect()->back()->with('error', 'Error: ' . $e->getMessage());
        }
    }
}
