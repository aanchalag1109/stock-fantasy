<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReferralController extends Controller
{
    public function index()
    {
        $referrals = DB::table('users as referrer')
            ->join('users as referred', 'referrer.referral_code', '=', 'referred.referred_by')
            ->leftJoin('referral_transactions', 'referral_transactions.referred_id', '=', 'referred.id')
            ->select(
                'referrer.id as referrer_id',
                'referrer.name as referrer_name',
                'referrer.referral_code',
                'referred.id as referred_id',
                'referred.name as referred_name',
                'referred.created_at as joined_date',
                DB::raw('COUNT(referral_transactions.id) as total_deposits'),
                DB::raw('SUM(referral_transactions.deposit_amount) as total_deposit_amount'),
                DB::raw('SUM(referral_transactions.bonus_amount) as total_bonus_earned')
            )
            ->groupBy('referrer.id', 'referrer.name', 'referrer.referral_code', 'referred.id', 'referred.name', 'referred.created_at')
            ->orderBy('referred.created_at', 'desc')
            ->paginate(20);

        $stats = [
            'total_referrals' => DB::table('users')->whereNotNull('referred_by')->count(),
            'total_referrers' => DB::table('users')->whereNotNull('referral_code')->whereExists(function($query) {
                $query->select(DB::raw(1))
                      ->from('users as u2')
                      ->whereRaw('u2.referred_by = users.referral_code');
            })->count(),
            'total_bonus_paid' => DB::table('referral_transactions')->sum('bonus_amount'),
            'total_deposits_from_referrals' => DB::table('referral_transactions')->sum('deposit_amount')
        ];

        return view('admin.referrals.index', compact('referrals', 'stats'));
    }

    public function transactions()
    {
        $transactions = DB::table('referral_transactions')
            ->join('users as referrer', 'referral_transactions.referrer_id', '=', 'referrer.id')
            ->join('users as referred', 'referral_transactions.referred_id', '=', 'referred.id')
            ->select(
                'referral_transactions.*',
                'referrer.name as referrer_name',
                'referrer.referral_code',
                'referred.name as referred_name'
            )
            ->orderBy('referral_transactions.created_at', 'desc')
            ->paginate(20);

        return view('admin.referrals.transactions', compact('transactions'));
    }

    public function topReferrers()
    {
        $topReferrers = DB::table('users as referrer')
            ->join('users as referred', 'referrer.referral_code', '=', 'referred.referred_by')
            ->leftJoin('referral_transactions', 'referral_transactions.referred_id', '=', 'referred.id')
            ->select(
                'referrer.id',
                'referrer.name',
                'referrer.referral_code',
                DB::raw('COUNT(DISTINCT referred.id) as total_referrals'),
                DB::raw('SUM(referral_transactions.bonus_amount) as total_earnings'),
                DB::raw('SUM(referral_transactions.deposit_amount) as total_deposits_generated')
            )
            ->groupBy('referrer.id', 'referrer.name', 'referrer.referral_code')
            ->orderBy('total_referrals', 'desc')
            ->limit(50)
            ->get();

        return view('admin.referrals.top-referrers', compact('topReferrers'));
    }

    public function settings()
    {
        $settings = DB::table('settings')
            ->whereIn('key', ['referral_bonus_percentage', 'referral_max_deposits', 'referral_first_deposit_bonus'])
            ->pluck('value', 'key');

        return view('admin.referrals.settings', compact('settings'));
    }

    public function updateSettings(Request $request)
    {
        $settings = [
            'referral_bonus_percentage' => $request->referral_bonus_percentage ?? 8,
            'referral_max_deposits' => $request->referral_max_deposits ?? 10,
            'referral_first_deposit_bonus' => $request->referral_first_deposit_bonus ?? 8
        ];

        foreach ($settings as $key => $value) {
            DB::table('settings')->updateOrInsert(
                ['key' => $key],
                ['value' => $value, 'updated_at' => now()]
            );
        }

        return redirect()->back()->with('success', 'Referral settings updated successfully!');
    }
}