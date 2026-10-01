<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\ReferralTransaction;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ReferralController extends Controller
{
    public function processDeposit(Request $request)
    {
        $userId = $request->input('user_id');
        $amount = $request->input('amount');
        
        $user = User::find($userId);
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'User not found']);
        }
        
        // Update user deposit balance and count
        $user->deposit_balance += $amount;
        $user->total_deposits_count += 1;
        
        $depositNumber = $user->total_deposits_count;
        $isFirstDeposit = $depositNumber == 1;
        
        // Give bonus to new user on first deposit
        if ($isFirstDeposit) {
            $userBonus = $amount * 0.08; // 8% bonus
            $user->bonus_balance += $userBonus;
        }
        
        $user->save();
        
        // Process referral bonus if user was referred
        if ($user->referred_by && $depositNumber <= 10) {
            $this->processReferralBonus($user, $amount, $depositNumber);
        }
        
        return response()->json([
            'success' => true,
            'message' => 'Deposit processed successfully',
            'user_bonus' => $isFirstDeposit ? $userBonus : 0
        ]);
    }
    
    private function processReferralBonus($user, $amount, $depositNumber)
    {
        $promoter = User::find($user->referred_by);
        if (!$promoter) return;
        
        $bonusPercentage = $depositNumber == 1 ? 8 : 3; // 8% for first, 3% for next 9
        $bonusAmount = $amount * ($bonusPercentage / 100);
        
        // Add to promoter's referral earnings
        $promoter->referral_earnings += $bonusAmount;
        $promoter->save();
        
        // Log referral transaction
        ReferralTransaction::create([
            'promoter_id' => $promoter->id,
            'referred_user_id' => $user->id,
            'deposit_amount' => $amount,
            'bonus_amount' => $bonusAmount,
            'bonus_percentage' => $bonusPercentage,
            'deposit_number' => $depositNumber,
            'type' => $depositNumber == 1 ? 'first_deposit' : 'subsequent_deposit'
        ]);
    }
    
    public function getReferralData(Request $request)
    {
        $userId = $request->input('user_id');
        $user = User::find($userId);
        
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'User not found']);
        }
        
        // Generate referral code if not exists
        if (!$user->referral_code) {
            $user->referral_code = 'REF' . strtoupper(Str::random(6));
            $user->save();
        }
        
        $referredUsers = User::where('referred_by', $userId)
            ->select('id', 'name', 'created_at')
            ->get();
            
        $referralTransactions = [];
        
        return response()->json([
            'success' => true,
            'referral_code' => $user->referral_code,
            'referral_earnings' => $user->referral_earnings,
            'total_referrals' => $user->total_referrals,
            'referred_users' => $referredUsers,
            'referral_transactions' => $referralTransactions
        ]);
    }
    
    public function getWalletBalance(Request $request)
    {
        $userId = $request->input('user_id');
        $user = User::find($userId);
        
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'User not found']);
        }
        
        $totalCoins = $user->deposit_balance + $user->bonus_balance + $user->earnings_balance;
        
        return response()->json([
            'success' => true,
            'total_coins' => $totalCoins,
            'deposit_balance' => $user->deposit_balance,
            'bonus_balance' => $user->bonus_balance,
            'earnings_balance' => $user->earnings_balance,
            'referral_earnings' => $user->referral_earnings
        ]);
    }
}