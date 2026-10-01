<?php

// Test LG Pay Callback Route
Route::get('/test-lgpay-callback/{orderId}', function($orderId) {
    $payment = \DB::table('payments')->where('order_id', $orderId)->first();
    
    if (!$payment) {
        return response()->json(['error' => 'Payment not found']);
    }
    
    // Simulate callback data
    $params = [
        'order_sn' => $orderId,
        'status' => 1,
        'app_id' => 'YD4484'
    ];
    
    // Generate signature
    ksort($params);
    $string = http_build_query($params);
    $string = urldecode($string);
    $string = trim($string) . '&key=2rQnx8NosOLyJAkCipz6ET2Ym70ME7';
    $params['sign'] = strtoupper(md5($string));
    
    // Call the callback
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, url('/payment/lgpay-callback'));
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    // Check result
    $updatedPayment = \DB::table('payments')->where('order_id', $orderId)->first();
    $user = \DB::table('users')->where('id', $payment->user_id)->first();
    $transaction = \DB::table('transactions')->where('transaction_id', $orderId)->first();
    
    return response()->json([
        'test_params' => $params,
        'callback_response' => json_decode($response, true),
        'http_code' => $httpCode,
        'payment_before' => [
            'status' => $payment->payment_status,
            'amount' => $payment->amount
        ],
        'payment_after' => [
            'status' => $updatedPayment->payment_status,
            'amount' => $updatedPayment->amount
        ],
        'user_balance' => $user->deposit_balance ?? 0,
        'transaction_created' => $transaction ? 'Yes' : 'No',
        'transaction' => $transaction
    ], 200, [], JSON_PRETTY_PRINT);
});
