<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;

use App\Models\Transaction;
use App\Models\User;
use Illuminate\Http\Request;

class TransactionController extends Controller
{
    public function index(Request $request) {
        $transactions = Transaction::with('user')
            ->when($request->user_id, function($q) use ($request) {
                return $q->where('user_id', $request->user_id);
            })
            ->when($request->status, function($q) use ($request) {
                return $q->where('status', $request->status);
            })
            ->when($request->type, function($q) use ($request) {
                return $q->where('type', $request->type);
            })
            ->when($request->search, function($q) use ($request) {
                return $q->whereHas('user', function($query) use ($request) {
                    $query->where('name', 'like', '%' . $request->search . '%')
                          ->orWhere('email', 'like', '%' . $request->search . '%');
                });
            })
            ->latest()->paginate(15);
        
        $selectedUser = $request->user_id ? User::find($request->user_id) : null;
        
        return view('admin.transactions.index', compact('transactions', 'selectedUser'));
    }

    public function create() {
        $users = User::all();
        return view('admin.transactions.create', compact('users'));
    }

    public function store(Request $request) {
        $request->validate([
            'user_id' => 'required|exists:users,id',
            'type' => 'required|in:deposit,withdrawal,contest_entry,winnings',
            'amount' => 'required|numeric|min:0.01',
            'status' => 'required|in:pending,success,failed',
            'payment_method' => 'nullable|string|max:255',
            'transaction_id' => 'nullable|string|max:255',
            'description' => 'nullable|string|max:500',
        ]);

        $transaction = Transaction::create($request->all());

        // Update user balance based on transaction type
        $user = User::find($request->user_id);
        if ($request->type == 'deposit') {
            $user->deposit_balance += $request->amount;
        } elseif ($request->type == 'winnings') {
            $user->winnings_balance += $request->amount;
        } elseif ($request->type == 'withdrawal' || $request->type == 'contest_entry') {
            $user->winnings_balance -= $request->amount;
        }
        $user->save();

        return redirect()->route('admin.transactions.index')->with('success', 'Transaction created successfully!');
    }

    public function show($id) {
        $transaction = Transaction::with('user')->findOrFail($id);
        
        // Fetch payment details from user_payment_details table
        $paymentDetails = \DB::table('user_payment_details')
            ->where('user_id', $transaction->user_id)
            ->first();
        
        return view('admin.transactions.show', compact('transaction', 'paymentDetails'));
    }

    public function edit($id) {
        $transaction = Transaction::findOrFail($id);
        $users = User::all();
        return view('admin.transactions.edit', compact('transaction', 'users'));
    }

    public function update(Request $request, $id) {
        $transaction = Transaction::findOrFail($id);

        $request->validate([
            'user_id' => 'required|exists:users,id',
            'type' => 'required|in:deposit,withdrawal,contest_entry,winnings',
            'amount' => 'required|numeric|min:0.01',
            'status' => 'required|in:pending,success,failed',
            'payment_method' => 'nullable|string|max:255',
            'transaction_id' => 'nullable|string|max:255',
            'description' => 'nullable|string|max:500',
        ]);

        // Revert old balance change before applying new one (for status/amount changes)
        $user = User::find($transaction->user_id);
        if ($transaction->status == 'success') {
            if ($transaction->type == 'deposit') {
                $user->deposit_balance -= $transaction->amount;
            } elseif ($transaction->type == 'winnings') {
                $user->winnings_balance -= $transaction->amount;
            } elseif ($transaction->type == 'withdrawal' || $transaction->type == 'contest_entry') {
                $user->winnings_balance += $transaction->amount;
            }
        }

        $transaction->update($request->all());

        // Apply new balance change if new status is successful
        if ($transaction->status == 'success') {
            if ($transaction->type == 'deposit') {
                $user->deposit_balance += $transaction->amount;
            } elseif ($transaction->type == 'winnings') {
                $user->winnings_balance += $transaction->amount;
            } elseif ($transaction->type == 'withdrawal' || $transaction->type == 'contest_entry') {
                $user->winnings_balance -= $transaction->amount;
            }
        }
        $user->save();

        return redirect()->route('admin.transactions.index')->with('success', 'Transaction updated successfully!');
    }

    public function destroy($id) {
        $transaction = Transaction::findOrFail($id);
        // Revert balance if transaction was successful before deleting
        $user = User::find($transaction->user_id);
        if ($transaction->status == 'success') {
            if ($transaction->type == 'deposit') {
                $user->deposit_balance -= $transaction->amount;
            } elseif ($transaction->type == 'winnings') {
                $user->winnings_balance -= $transaction->amount;
            } elseif ($transaction->type == 'withdrawal' || $transaction->type == 'contest_entry') {
                $user->winnings_balance += $transaction->amount;
            }
            $user->save();
        }
        $transaction->delete();
        return back()->with('success', 'Transaction deleted!');
    }

    public function approve($id) {
        $transaction = Transaction::findOrFail($id);
        
        if ($transaction->status !== 'pending') {
            return back()->with('error', 'Only pending transactions can be approved.');
        }
        
        \DB::transaction(function () use ($transaction) {
            $transaction->status = 'success';
            $transaction->save();
            
            $user = User::lockForUpdate()->find($transaction->user_id);
            
            if ($transaction->type === 'deposit') {
                $user->deposit_balance += $transaction->amount;
            }
            
            $user->save();
        });
        
        return back()->with('success', 'Transaction approved successfully!');
    }

    public function reject($id) {
        $transaction = Transaction::findOrFail($id);
        
        if ($transaction->status !== 'pending') {
            return back()->with('error', 'Only pending transactions can be rejected.');
        }
        
        \DB::transaction(function () use ($transaction) {
            $transaction->status = 'failed';
            $transaction->save();
            
            // If withdrawal is rejected, refund the amount to winnings balance
            if ($transaction->type === 'withdrawal') {
                $user = User::lockForUpdate()->find($transaction->user_id);
                $user->winnings_balance += $transaction->amount;
                $user->save();
                
                // Create refund transaction using 'deposit' type
                \DB::table('transactions')->insert([
                    'user_id' => $transaction->user_id,
                    'type' => 'deposit',
                    'amount' => $transaction->amount,
                    'status' => 'success',
                    'description' => 'Withdrawal rejected - Refund to winnings',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        });
        
        return back()->with('success', 'Transaction rejected successfully!');
    }
}