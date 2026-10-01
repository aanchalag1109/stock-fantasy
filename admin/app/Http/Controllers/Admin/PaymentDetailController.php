<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PaymentDetailController extends Controller
{
    public function index()
    {
        $paymentDetails = DB::table('user_payment_details')
            ->join('users', 'user_payment_details.user_id', '=', 'users.id')
            ->select(
                'user_payment_details.*',
                'users.name as user_name',
                'users.mobile as user_mobile',
                'users.email as user_email'
            )
            ->orderBy('user_payment_details.created_at', 'desc')
            ->paginate(20);

        return view('admin.payment_details.index', compact('paymentDetails'));
    }

    public function show($id)
    {
        $paymentDetail = DB::table('user_payment_details')
            ->join('users', 'user_payment_details.user_id', '=', 'users.id')
            ->where('user_payment_details.id', $id)
            ->select(
                'user_payment_details.*',
                'users.name as user_name',
                'users.mobile as user_mobile',
                'users.email as user_email'
            )
            ->first();

        if (!$paymentDetail) {
            return redirect()->route('admin.payment-details.index')->with('error', 'Payment details not found');
        }

        return view('admin.payment_details.show', compact('paymentDetail'));
    }
}
