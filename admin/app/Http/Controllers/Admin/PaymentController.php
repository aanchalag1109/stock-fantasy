<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class PaymentController extends Controller
{
    public function index(Request $request)
    {
        $query = DB::table('payments')
            ->leftJoin('users', 'payments.user_id', '=', 'users.id')
            ->select(
                'payments.*',
                'users.name as user_name',
                'users.mobile as user_mobile',
                'users.email as user_email'
            );

        // Search - Check first
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('payments.order_id', 'like', "%{$search}%")
                  ->orWhere('users.name', 'like', "%{$search}%")
                  ->orWhere('users.mobile', 'like', "%{$search}%")
                  ->orWhere('users.email', 'like', "%{$search}%");
            });
        }

        // Filter by status
        if ($request->filled('status')) {
            $query->where('payments.payment_status', $request->status);
        }

        $payments = $query->orderBy('payments.created_at', 'desc')->paginate(20);

        return view('admin.payments.index', compact('payments'));
    }

    public function approve($id)
    {
        DB::beginTransaction();
        try {
            $payment = DB::table('payments')->where('id', $id)->first();
            
            if (!$payment || $payment->payment_status != 0) {
                return back()->with('error', 'Payment not found or already processed');
            }

            // Update payment status
            DB::table('payments')->where('id', $id)->update([
                'payment_status' => 1,
                'updated_at' => Carbon::now()
            ]);

            // Add to user deposit balance
            DB::table('users')->where('id', $payment->user_id)->increment('deposit_balance', $payment->amount);

            // Create transaction record
            DB::table('transactions')->insert([
                'user_id' => $payment->user_id,
                'type' => 'deposit',
                'amount' => $payment->amount,
                'status' => 'success',
                'payment_method' => 'Admin Approved',
                'transaction_id' => $payment->order_id,
                'created_at' => Carbon::now(),
                'updated_at' => Carbon::now()
            ]);

            DB::commit();
            return back()->with('success', 'Payment approved successfully');
        } catch (\Exception $e) {
            DB::rollBack();
            return back()->with('error', 'Failed to approve payment: ' . $e->getMessage());
        }
    }

    public function reject($id)
    {
        DB::beginTransaction();
        try {
            $payment = DB::table('payments')->where('id', $id)->first();
            
            if (!$payment || $payment->payment_status != 0) {
                return back()->with('error', 'Payment not found or already processed');
            }

            // Update payment status to failed
            DB::table('payments')->where('id', $id)->update([
                'payment_status' => -1,
                'updated_at' => Carbon::now()
            ]);

            // Create transaction record
            DB::table('transactions')->insert([
                'user_id' => $payment->user_id,
                'type' => 'deposit',
                'amount' => $payment->amount,
                'status' => 'failed',
                'payment_method' => 'Admin Rejected',
                'transaction_id' => $payment->order_id,
                'created_at' => Carbon::now(),
                'updated_at' => Carbon::now()
            ]);

            DB::commit();
            return back()->with('success', 'Payment rejected successfully');
        } catch (\Exception $e) {
            DB::rollBack();
            return back()->with('error', 'Failed to reject payment: ' . $e->getMessage());
        }
    }

    public function verify($id)
    {
        try {
            $payment = DB::table('payments')->where('id', $id)->first();
            
            if (!$payment) {
                return back()->with('error', 'Payment not found');
            }

            $params = ['app_id' => 'YD4484', 'order_sn' => $payment->order_id];
            ksort($params);
            $signStr = 'app_id=' . $params['app_id'] . '&order_sn=' . $params['order_sn'] . '&key=2rQnx8NosOLyJAkCipz6ET2Ym70ME7';
            $params['sign'] = strtoupper(md5($signStr));
            
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, 'https://www.lg-pay.com/api/order/query?' . http_build_query($params));
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            
            if ($httpCode != 200) {
                return back()->with('error', 'Failed to connect to LG Pay (HTTP ' . $httpCode . ')');
            }
            
            $result = json_decode($response, true);
            
            if (!$result || !isset($result['status'])) {
                return back()->with('error', 'Invalid response from LG Pay');
            }
            
            // Check if payment is successful
            if ($result['status'] == 1 && isset($result['data']['money'])) {
                $amount = $result['data']['money'] / 100; // Convert from paise to rupees
                return back()->with('success', 'LG Pay Status: PAID ✓ - Amount: ₹' . $amount . ' - You can now approve this payment');
            } elseif ($result['status'] == 0) {
                return back()->with('warning', 'LG Pay Status: PENDING - Payment not completed yet');
            } else {
                return back()->with('error', 'LG Pay Status: FAILED - ' . ($result['msg'] ?? 'Unknown error'));
            }
            
        } catch (\Exception $e) {
            return back()->with('error', 'Error: ' . $e->getMessage());
        }
    }
}
