<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BannerController;
use App\Http\Controllers\Api\SessionController;
use App\Http\Controllers\Api\ContestController;
use App\Http\Controllers\Api\BasketController;

use App\Http\Controllers\Api\WalletController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\CalculateController;
use App\Http\Controllers\Api\LivePriceController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Admin\PerformanceController;



Route::post('/payment/lgpay-callback', [\App\Http\Controllers\Api\PaymentController::class, 'lgpayCallback']);



Route::get('/payment-return', function(\Illuminate\Http\Request $request) {
    $orderId = $request->query('order_id');
    \Log::info('Payment return handler', ['order_id' => $orderId]);
    
    if (!$orderId) {
        return redirect('probtrade://payment-failed?error=no_order_id');
    }
    
    $payment = \DB::table('payments')->where('order_id', $orderId)->first();
    
    if (!$payment) {
        \Log::error('Payment not found', ['order_id' => $orderId]);
        return redirect('probtrade://payment-failed?error=payment_not_found');
    }
    
    // If already processed, redirect to app
    if ($payment->payment_status == 1) {
        \Log::info('Payment already processed', ['order_id' => $orderId]);
        return redirect('probtrade://payment-success?order_id=' . $orderId);
    }
    
    // Query LG Pay to verify payment
    $params = ['app_id' => 'YD4484', 'order_sn' => $orderId];
    ksort($params);
    $signStr = 'app_id=' . $params['app_id'] . '&order_sn=' . $params['order_sn'] . '&key=2rQnx8NosOLyJAkCipz6ET2Ym70ME7';
    $params['sign'] = strtoupper(md5($signStr));
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, 'https://www.lg-pay.com/api/order/query?' . http_build_query($params));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    \Log::info('LG Pay query response', ['http_code' => $httpCode, 'response' => $response]);
    
    if ($httpCode == 200) {
        $result = json_decode($response, true);
        
        if ($result && isset($result['status']) && $result['status'] == 1 && isset($result['data']['status']) && $result['data']['status'] == 1) {
            \DB::beginTransaction();
            try {
                // Update payment status
                \DB::table('payments')->where('order_id', $orderId)->update([
                    'payment_status' => 1,
                    'updated_at' => \Carbon\Carbon::now()
                ]);
                
                // Add to wallet
                \DB::table('users')->where('id', $payment->user_id)->increment('deposit_balance', $payment->amount);
                
                // Create transaction
                \DB::table('transactions')->insert([
                    'user_id' => $payment->user_id,
                    'type' => 'deposit',
                    'amount' => $payment->amount,
                    'transaction_id' => $orderId,
                    'description' => 'Deposit via LG Pay',
                    'created_at' => \Carbon\Carbon::now(),
                    'updated_at' => \Carbon\Carbon::now()
                ]);
                
                \DB::commit();
                \Log::info('Wallet updated successfully', ['order_id' => $orderId, 'amount' => $payment->amount]);
                
                return redirect('probtrade://payment-success?order_id=' . $orderId);
            } catch (\Exception $e) {
                \DB::rollBack();
                \Log::error('Wallet update failed', ['error' => $e->getMessage()]);
                return redirect('probtrade://payment-failed?error=wallet_update_failed');
            }
        }
    }
    
    // Payment not confirmed yet
    \Log::warning('Payment not confirmed', ['order_id' => $orderId]);
    return redirect('probtrade://payment-pending?order_id=' . $orderId);
});


// Authentication Routes
Route::post('/login', [AuthController::class, 'login']);
Route::post('/register', [AuthController::class, 'register']);
Route::post('/password-login', [AuthController::class, 'passwordLogin']);
Route::post('/check-user', [AuthController::class, 'checkUser']);



    Route::get('/banners', [BannerController::class, 'banners']);
    Route::get('/upcoming-sessions', [SessionController::class, 'upcomingSessions']);



   Route::get('sessions/{sessionId}', [SessionController::class, 'getSession']);
    Route::get('/contests/session/{sessionId}', [ContestController::class, 'contestsBySession']);
    Route::get('/my-contests/session/{sessionId}', [ContestController::class, 'myContestsBySession']);
    Route::get('/user-contests', [ContestController::class, 'getUserContests']);
    Route::get('/user-joined-sessions', [SessionController::class, 'getUserJoinedSessions']);
    Route::get('/contests/{id}', [ContestController::class, 'getContest']);
    Route::post('/bulk-join-contest', [ContestController::class, 'bulkJoinContest']);



Route::get('/sessions', [ContestController::class, 'getUserSessions']); // All sessions
Route::get('/sessions/active', [ContestController::class, 'getActiveSession']); // Active session
Route::get('/league-session-assets/{sessionId}', [ContestController::class, 'getSessionAssets']); // Session assets
Route::get('/session-assets-grouped/{sessionId}', [ContestController::class, 'getSessionAssetsGrouped']); // New grouped API




Route::delete('/saved-baskets/{id}', [BasketController::class, 'destroy']);
Route::post('/cleanup-empty-baskets', [BasketController::class, 'cleanupEmptyBaskets']);
Route::get('/saved-baskets', [BasketController::class, 'savedBaskets']);
Route::get('/contest-baskets', [BasketController::class, 'getContestBaskets']);
Route::post('/delete-basket', [BasketController::class, 'deleteBasket']);
Route::post('/edit-basket', [BasketController::class, 'editBasket']);
Route::post('/update-basket', [BasketController::class, 'editBasket']);
Route::post('/save-standalone-basket', [BasketController::class, 'storeStandalone']);
Route::post('/save-basket', [BasketController::class, 'saveBasket']);



Route::get('/wallet-amount', [WalletController::class, 'getWalletAmount']);

Route::get('/user-transactions', [WalletController::class, 'getUserTransactions']);

// Testing API - Empty transactions
Route::get('/user-transactions-empty', function(Request $request) {
    return response()->json([
        'transactions' => []
    ]);
});

// Testing API - Clear user transactions from DB
Route::get('/clear-user-transactions', function(Request $request) {
    $userId = $request->query('user_id');
    
    if (!$userId) {
        return response()->json([
            'success' => false,
            'error' => 'user_id is required'
        ], 400);
    }
    
    $deleted = DB::table('transactions')->where('user_id', $userId)->delete();
    
    return response()->json([
        'success' => true,
        'message' => "Deleted {$deleted} transactions for user {$userId}",
        'deleted_count' => $deleted
    ]);
});

Route::post('/deposit-amount', [WalletController::class, 'depositAmount']);

Route::post('/withdraw-amount', [WalletController::class, 'withdrawAmount']);

// Debug payment route
Route::get('/debug-payment', function(Request $request) {
    $data = $request->query('data');
    
    try {
        $urlDecoded = urldecode($data);
        $base64Decoded = base64_decode($urlDecoded);
        $parsed = json_decode($base64Decoded, true);
        
        $user = \App\Models\User::find($parsed['user_id'] ?? 0);
        
        return response()->json([
            'step1_encrypted' => $data,
            'step2_url_decoded' => $urlDecoded,
            'step3_base64_decoded' => $base64Decoded,
            'step4_json_parsed' => $parsed,
            'step5_user_exists' => $user ? true : false,
            'step6_user_data' => $user ? ['id' => $user->id, 'name' => $user->name] : null,
            'step7_timestamp_diff' => isset($parsed['timestamp']) ? (time() * 1000 - $parsed['timestamp']) : null,
            'step8_timestamp_valid' => isset($parsed['timestamp']) ? ((time() * 1000 - $parsed['timestamp']) < 600000) : false,
            'logs' => \Illuminate\Support\Facades\DB::getQueryLog()
        ]);
    } catch (\Exception $e) {
        return response()->json(['error' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);
    }
});

// Check payment and wallet
Route::get('/check-wallet', function(Request $request) {
    $orderId = $request->query('order_id');
    $userId = $request->query('user_id');
    
    $payment = DB::table('payments')->where('order_id', $orderId)->first();
    $user = \App\Models\User::find($userId);
    $transaction = DB::table('transactions')->where('transaction_id', $orderId)->first();
    
    return response()->json([
        'payment' => $payment,
        'user_wallet' => $user ? [
            'deposit_balance' => $user->deposit_balance,
            'winnings_balance' => $user->winnings_balance,
            'total' => floatval($user->deposit_balance) + floatval($user->winnings_balance)
        ] : null,
        'transaction' => $transaction,
        'callback_logs' => DB::table('payments')->where('order_id', $orderId)->first()
    ]);
});

// Check latest payment for user
Route::get('/check-latest-payment', function(Request $request) {
    $userId = $request->query('user_id');
    
    $payment = DB::table('payments')
        ->where('user_id', $userId)
        ->orderBy('created_at', 'desc')
        ->first();
    
    return response()->json([
        'payment_status' => $payment ? $payment->payment_status : 0,
        'amount' => $payment ? $payment->amount : 0,
        'order_id' => $payment ? $payment->order_id : null
    ]);
});

// Manual test payment
Route::get('/test-payment-add', function(Request $request) {
    $userId = $request->query('user_id', 272);
    $amount = $request->query('amount', 200);
    $orderId = 'TEST_' . time();
    
    try {
        // Create payment record
        DB::table('payments')->insert([
            'order_id' => $orderId,
            'user_id' => $userId,
            'amount' => $amount,
            'payment_status' => 1,
            'created_at' => now(),
            'updated_at' => now()
        ]);
        
        // Add to wallet
        DB::table('users')->where('id', $userId)->increment('deposit_balance', $amount);
        
        // Create transaction (without status field)
        DB::table('transactions')->insert([
            'user_id' => $userId,
            'type' => 'deposit',
            'amount' => $amount,
            'transaction_id' => $orderId,
            'description' => 'Test deposit',
            'created_at' => now(),
            'updated_at' => now()
        ]);
        
        $user = \App\Models\User::find($userId);
        
        return response()->json([
            'success' => true,
            'order_id' => $orderId,
            'amount_added' => $amount,
            'new_balance' => floatval($user->deposit_balance) + floatval($user->winnings_balance)
        ]);
    } catch (\Exception $e) {
        return response()->json(['error' => $e->getMessage()]);
    }
});

// Manual callback trigger
Route::get('/trigger-callback', function(Request $request) {
    $orderId = $request->query('order_id');
    
    if (!$orderId) {
        return response()->json(['error' => 'order_id required']);
    }
    
    $order = DB::table('payments')->where('order_id', $orderId)->first();
    
    if (!$order) {
        return response()->json(['error' => 'Order not found']);
    }
    
    if ($order->payment_status != 0) {
        return response()->json(['error' => 'Already processed']);
    }
    
    try {
        DB::beginTransaction();
        
        DB::table('payments')->where('order_id', $orderId)->update(['payment_status' => 1]);
        DB::table('users')->where('id', $order->user_id)->increment('deposit_balance', $order->amount);
        DB::table('transactions')->insert([
            'user_id' => $order->user_id,
            'type' => 'deposit',
            'amount' => $order->amount,
            'transaction_id' => $orderId,
            'description' => 'Deposit via LG Pay',
            'created_at' => now(),
            'updated_at' => now()
        ]);
        
        DB::commit();
        
        return response()->json(['success' => true, 'message' => 'Callback processed']);
    } catch (\Exception $e) {
        DB::rollBack();
        return response()->json(['error' => $e->getMessage()]);
    }
});


Route::get('/announcements', [ContestController::class, 'getAnnouncements']);


Route::get('/notifications', [NotificationController::class, 'getUserNotifications']);


Route::get('/settings', [AuthController::class, 'getSettings']);

Route::post('/update-profile', [AuthController::class, 'updateProfile']);
Route::get('/user-profile', [AuthController::class, 'getUserProfile']);

Route::prefix('payment-details')->group(function () {
    Route::get('/{user_id}', [AuthController::class, 'getPaymentDetails']);
    Route::post('/update', [AuthController::class, 'updatePaymentDetails']);
});

// Calculate Routes
Route::post('/save-start-prices', [CalculateController::class, 'saveStartPrices']);
Route::post('/save-end-prices', [CalculateController::class, 'saveEndPrices']);
Route::post('/calculate-results', [CalculateController::class, 'calculateResults']);

// Testing API - Calculate and distribute prizes for all contests in session
Route::get('/test-calculate-contest', function(Request $request) {
    $contestId = $request->query('contest_id');
    
    if (!$contestId) {
        return response()->json(['success' => false, 'error' => 'contest_id is required'], 400);
    }
    
    try {
        $contest = DB::table('contests')->where('id', $contestId)->first();
        if (!$contest) {
            return response()->json(['error' => 'Contest not found'], 404);
        }
        
        $session = DB::table('league_sessions')->where('id', $contest->league_session_id)->first();
        
        $result = [
            'session_id' => $session->id,
            'session_name' => $session->name,
            'session_status' => $session->status,
            'start_time' => $session->start_time,
            'end_time' => $session->end_time,
            'contests' => []
        ];
        
        $contests = DB::table('contests')->where('league_session_id', $session->id)->orderBy('id')->get();
        
        foreach ($contests as $c) {
            $prizes = DB::table('contest_performance_prizes')->where('contest_id', $c->id)->orderBy('rank_start')->get();
            
            if ($prizes->isEmpty()) {
                $participants = DB::table('contest_entries')->where('contest_id', $c->id)->count();
                if ($participants > 0) {
                    $pricingController = new \App\Http\Controllers\Api\PricingController();
                    $prizeData = $pricingController->flexiblePricing(new Request([
                        'participants' => $participants,
                        'entry_fee' => $c->entry_fee,
                        'platform_fee' => $c->platform_fee,
                        'winning_percentage' => $c->winning_percentage ?? 30,
                        'category' => $c->category
                    ]));
                    
                    $apiData = json_decode($prizeData->getContent(), true);
                    $performanceController = new PerformanceController();
                    $performanceController->saveApiStructure(new Request([
                        'contest_id' => $c->id,
                        'participants' => $participants,
                        'api_data' => $apiData
                    ]));
                    
                    $prizes = DB::table('contest_performance_prizes')->where('contest_id', $c->id)->orderBy('rank_start')->get();
                }
            }
            
            $entries = DB::table('contest_entries')->where('contest_id', $c->id)->orderBy('total_score', 'desc')->get();
            
            $prizeCalculation = [];
            $transactionsToInsert = [];
            
            foreach ($entries as $entry) {
                $rank = $entry->rank;
                $prize = 0;
                
                foreach ($prizes as $dist) {
                    if ($rank >= $dist->rank_start && $rank <= $dist->rank_end) {
                        $prize = floatval($dist->per_winner_amount);
                        break;
                    }
                }
                
                $prizeCalculation[] = [
                    'entry_id' => $entry->id,
                    'user_id' => $entry->user_id,
                    'rank' => $rank,
                    'total_score' => $entry->total_score,
                    'prize_amount' => $prize
                ];
                
                if ($prize > 0) {
                    $transactionsToInsert[] = [
                        'user_id' => $entry->user_id,
                        'type' => 'winnings',
                        'amount' => $prize,
                        'transaction_id' => 'CONTEST_' . $c->id . '_ENTRY_' . $entry->id,
                        'description' => 'Prize for ' . strtoupper($c->category) . ' contest ' . $c->id . ', entry ' . $entry->id
                    ];
                }
            }
            
            $calculateController = new CalculateController();
            $calcResponse = $calculateController->calculateResults(new Request(['contest_id' => $c->id, 'credit_wallet' => true]));
            
            $result['contests'][] = [
                'contest_id' => $c->id,
                'contest_category' => $c->category,
                'contest_status' => $c->status,
                'entry_fee' => $c->entry_fee,
                'prize_pool' => $c->prize_pool,
                'total_spots' => $c->participants ?? 0,
                'filled_spots' => $entries->count(),
                'prizes' => $prizes,
                'entries' => $entries,
                'prize_calculation' => $prizeCalculation,
                'transactions' => $transactionsToInsert,
                'calculation_result' => json_decode($calcResponse->getContent(), true)
            ];
        }
        
        return response()->json($result, 200, [], JSON_PRETTY_PRINT);
    } catch (\Exception $e) {
        return response()->json(['success' => false, 'error' => $e->getMessage(), 'trace' => $e->getTraceAsString()], 500);
    }
});

// Testing API - Debug all completed sessions with contests and calculations
Route::get('/debug-calculate-contest', function(Request $request) {
    $contestId = $request->query('contest_id');
    
    // If contest_id provided, show session and all its contests
    if ($contestId) {
        $contest = DB::table('contests')->where('id', $contestId)->first();
        if (!$contest) {
            return response()->json(['error' => 'Contest not found'], 404);
        }
        
        $session = DB::table('league_sessions')->where('id', $contest->league_session_id)->first();
        
        $result = [
            'session_id' => $session->id,
            'session_name' => $session->name,
            'session_status' => $session->status,
            'start_time' => $session->start_time,
            'end_time' => $session->end_time,
            'contests' => []
        ];
        
        $contests = DB::table('contests')
            ->where('league_session_id', $session->id)
            ->orderBy('id')
            ->get();
        
        foreach ($contests as $c) {
            $contestData = [
                'contest_id' => $c->id,
                'contest_category' => $c->category ?? null,
                'contest_status' => $c->status,
                'entry_fee' => $c->entry_fee,
                'prize_pool' => $c->prize_pool,
                'total_spots' => $c->participants ?? 0,
                'filled_spots' => DB::table('contest_entries')->where('contest_id', $c->id)->count(),
                'prizes' => [],
                'entries' => [],
                'prize_calculation' => [],
                'transactions' => []
            ];
            
            $prizes = DB::table('contest_performance_prizes')
                ->where('contest_id', $c->id)
                ->orderBy('rank_start')
                ->get();
            $contestData['prizes'] = $prizes;
            
            $entries = DB::table('contest_entries')
                ->where('contest_id', $c->id)
                ->orderBy('total_score', 'desc')
                ->get();
            $contestData['entries'] = $entries;
            
            foreach ($entries as $entry) {
                $rank = $entry->rank;
                $prize = 0;
                
                foreach ($prizes as $dist) {
                    if ($rank >= $dist->rank_start && $rank <= $dist->rank_end) {
                        $prize = floatval($dist->per_winner_amount);
                        break;
                    }
                }
                
                $contestData['prize_calculation'][] = [
                    'entry_id' => $entry->id,
                    'user_id' => $entry->user_id,
                    'rank' => $rank,
                    'total_score' => $entry->total_score,
                    'prize_amount' => $prize
                ];
                
                if ($prize > 0) {
                    $contestData['transactions'][] = [
                        'user_id' => $entry->user_id,
                        'type' => 'winnings',
                        'amount' => $prize,
                        'transaction_id' => 'CONTEST_' . $c->id . '_ENTRY_' . $entry->id,
                        'description' => 'Prize for ' . strtoupper($c->category) . ' contest ' . $c->id . ', entry ' . $entry->id
                    ];
                }
            }
            
            $result['contests'][] = $contestData;
        }
        
        return response()->json($result, 200, [], JSON_PRETTY_PRINT);
    }
    
    // Show all completed sessions with contests and calculations
    $result = [];
    
    $sessions = DB::table('league_sessions')
        ->where('status', 'completed')
        ->orderBy('id', 'desc')
        ->get();
    
    foreach ($sessions as $session) {
        $sessionData = [
            'session_id' => $session->id,
            'session_name' => $session->name,
            'session_status' => $session->status,
            'start_time' => $session->start_time,
            'end_time' => $session->end_time,
            'contests' => []
        ];
        
        $contests = DB::table('contests')
            ->where('league_session_id', $session->id)
            ->orderBy('id')
            ->get();
        
        foreach ($contests as $contest) {
            $contestData = [
                'contest_id' => $contest->id,
                'contest_category' => $contest->category ?? null,
                'contest_status' => $contest->status,
                'entry_fee' => $contest->entry_fee,
                'prize_pool' => $contest->prize_pool,
                'total_spots' => $contest->participants ?? 0,
                'filled_spots' => DB::table('contest_entries')->where('contest_id', $contest->id)->count(),
                'prizes' => [],
                'entries' => [],
                'prize_calculation' => [],
                'transactions' => []
            ];
            
            $prizes = DB::table('contest_performance_prizes')
                ->where('contest_id', $contest->id)
                ->orderBy('rank_start')
                ->get();
            $contestData['prizes'] = $prizes;
            
            $entries = DB::table('contest_entries')
                ->where('contest_id', $contest->id)
                ->orderBy('total_score', 'desc')
                ->get();
            $contestData['entries'] = $entries;
            
            foreach ($entries as $entry) {
                $rank = $entry->rank;
                $prize = 0;
                
                foreach ($prizes as $dist) {
                    if ($rank >= $dist->rank_start && $rank <= $dist->rank_end) {
                        $prize = floatval($dist->per_winner_amount);
                        break;
                    }
                }
                
                $contestData['prize_calculation'][] = [
                    'entry_id' => $entry->id,
                    'user_id' => $entry->user_id,
                    'rank' => $rank,
                    'total_score' => $entry->total_score,
                    'prize_amount' => $prize
                ];
                
                if ($prize > 0) {
                    $contestData['transactions'][] = [
                        'user_id' => $entry->user_id,
                        'type' => 'winnings',
                        'amount' => $prize,
                        'transaction_id' => 'CONTEST_' . $contest->id . '_ENTRY_' . $entry->id,
                        'description' => 'Prize for ' . strtoupper($contest->category) . ' contest ' . $contest->id . ', entry ' . $entry->id
                    ];
                }
            }
            
            $sessionData['contests'][] = $contestData;
        }
        
        $result[] = $sessionData;
    }
    
    return response()->json($result, 200, [], JSON_PRETTY_PRINT);
});

// Live Prices Routes
Route::get('/live-prices', [LivePriceController::class, 'getLivePrices']);
Route::get('/stock-live-price', [LivePriceController::class, 'getStockLivePrice']);
Route::get('/crypto-live-price', [LivePriceController::class, 'getCryptoLivePrice']);

// Performance Routes
Route::post('/save-api-structure', [PerformanceController::class, 'saveApiStructure']);

// ─── STATS: Session stock gainers/losers ─────────────────────────────────────
Route::get('/session-stats/{sessionId}', [\App\Http\Controllers\Api\StatsController::class, 'sessionStats']);

// ─── CONTEST PIN: Pinned contests first in session ───────────────────────────
// (Handled in contestsBySession — pinned contests come first automatically)

