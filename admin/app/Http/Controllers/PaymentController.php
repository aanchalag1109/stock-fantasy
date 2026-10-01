<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class PaymentController extends Controller
{
    private $secretKey = '2rQnx8NosOLyJAkCipz6ET2Ym 70ME7'; // Same as in Flutter app

    private function md5Sign($data, $key, $unset = [])
    {
        ksort($data);
        foreach ($unset as $value) {
            unset($data[$value]);
        }

        $string = http_build_query($data);
        $string = urldecode($string);
        $string = trim($string) . "&key=" . $key;

        return strtoupper(md5($string));
    }

    public function notify(Request $request)
    {
        $data = $request->all();
        $sign = $this->md5Sign($data, $this->secretKey, ['sign']);

        if ($sign == $data['sign']) {
            $orderSn = $data['order_sn'];
            $money = $data['money'] / 100;
            
            try {
                DB::table('users')
                    ->where('id', $this->getUserIdFromOrder($orderSn))
                    ->increment('deposit_balance', $money);

                Log::info("Payment success: Order $orderSn, Amount: $money");
                return response('success', 200);
            } catch (\Exception $e) {
                Log::error("Payment error: " . $e->getMessage());
                return response('error', 500);
            }
        }

        return response('invalid', 400);
    }

    public function depositAmount(Request $request)
    {
        $userId = $request->input('user_id');
        $amount = $request->input('wallet_balance');

        try {
            DB::table('users')
                ->where('id', $userId)
                ->increment('deposit_balance', $amount);

            return response()->json(['success' => true]);
        } catch (\Exception $e) {
            return response()->json(['success' => false], 500);
        }
    }

    private function getUserIdFromOrder($orderSn)
    {
        return 1; // Replace with actual logic
    }
}