<?php

// routes/web.php
use Illuminate\Support\Facades\Route;
Route::get('/run-cron', [\App\Http\Controllers\CronController::class, 'run']);

use Illuminate\Support\Facades\Auth;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Admin\ContestController;
use App\Http\Controllers\Admin\PortfolioController;
use App\Http\Controllers\Admin\EntryController;
use App\Http\Controllers\Admin\TransactionController;
use App\Http\Controllers\Admin\KycController;
use App\Http\Controllers\Admin\TicketController;
use App\Http\Controllers\Admin\AnnouncementController;
use App\Http\Controllers\Admin\LivePriceFeedController;
use App\Http\Controllers\Admin\Auth\LoginController;
use App\Http\Controllers\Admin\DashboardController;

// Debug route
Route::get('/debug-contest/{contestId}', function($contestId) {
    $entries = \DB::table('contest_entries')->where('contest_id', $contestId)->get();
    $entriesWithJoin = \DB::table('contest_entries')
        ->join('users', 'contest_entries.user_id', '=', 'users.id')
        ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
        ->leftJoin('users as basket_users', 'saved_baskets.user_id', '=', 'basket_users.id')
        ->where('contest_entries.contest_id', $contestId)
        ->select('contest_entries.*', 'users.name as user_name', 'users.mobile', 'saved_baskets.serial_no', 'basket_users.name as basket_owner')
        ->get();
    return response()->json(['contest_id' => $contestId, 'raw_count' => $entries->count(), 'joined_count' => $entriesWithJoin->count(), 'sample' => $entriesWithJoin->take(3)], 200, [], JSON_PRETTY_PRINT);
});

// Include admin routes
require __DIR__ . '/admin.php';

// Contest Testing Routes
Route::get('contest-testing', [\App\Http\Controllers\ApiController::class, 'getContestTestingPage']);
Route::get('api/contest-start-prices/{contestId}', [\App\Http\Controllers\ApiController::class, 'getContestStartPrices']);
Route::get('api/contest-end-prices/{contestId}', [\App\Http\Controllers\ApiController::class, 'getContestEndPrices']);

Route::get('debug/contest/{contestId}', function($contestId) {
    $data = [];
    
    // Check saved_baskets
    $savedBaskets = \DB::table('saved_baskets')
        ->where('contest_id', $contestId)
        ->get();
    $data['saved_baskets'] = $savedBaskets;
    
    // Check contest_entries
    $contestEntries = \DB::table('contest_entries')
        ->where('contest_id', $contestId)
        ->get();
    $data['contest_entries'] = $contestEntries;
    
    // Check all data for debugging
    $data['all_contest_entries'] = \DB::table('contest_entries')->get();
    $data['all_saved_baskets'] = \DB::table('saved_baskets')->get();
    $data['users'] = \DB::table('users')->get(['id', 'name', 'mobile']);
    
    // Check portfolios with contest_id
    $portfoliosContest = \DB::table('portfolios')
        ->where('contest_id', $contestId)
        ->get();
    $data['portfolios_contest_id'] = $portfoliosContest;
    
    // Check portfolios with league_session_id
    $portfoliosSession = \DB::table('portfolios')
        ->where('league_session_id', $contestId)
        ->get();
    $data['portfolios_league_session_id'] = $portfoliosSession;
    
    // Check contest details
    $contest = \DB::table('contests')->where('id', $contestId)->first();
    $data['contest'] = $contest;
    
    // If contest has league_session_id, check portfolios with that
    if ($contest && $contest->league_session_id) {
        $portfoliosWithSession = \DB::table('portfolios')
            ->where('league_session_id', $contest->league_session_id)
            ->get();
        $data['portfolios_with_session'] = $portfoliosWithSession;
        
        // Check portfolio_assets for first portfolio
        if ($portfoliosWithSession->isNotEmpty()) {
            $firstPortfolio = $portfoliosWithSession->first();
            $portfolioAssets = \DB::table('portfolio_assets')
                ->leftJoin('assets', 'portfolio_assets.asset_id', '=', 'assets.id')
                ->where('portfolio_assets.portfolio_id', $firstPortfolio->id)
                ->select('*')
                ->get();
            $data['portfolio_assets'] = $portfolioAssets;
        }
    }
    
    return response()->json($data, 200, [], JSON_PRETTY_PRINT);
});

Route::get('/', function() { return redirect()->route('admin.login'); });

// Payment Routes (Public - No Auth)
Route::get('/payment-success', function(\Illuminate\Http\Request $request) {
    $orderId = $request->query('order_id');
    return view('payment-success', ['order_id' => $orderId]);
});

Route::get('/verify-payment/{orderId}', function($orderId) {
    $payment = \DB::table('payments')->where('order_id', $orderId)->first();
    
    if (!$payment) {
        return response()->json(['success' => false, 'message' => 'Payment not found']);
    }
    
    if ($payment->payment_status == 1) {
        $user = \DB::table('users')->where('id', $payment->user_id)->first();
        return response()->json(['success' => true, 'payment_status' => 1, 'already_processed' => true, 'balance' => $user->deposit_balance ?? 0]);
    }
    
    // Set status to 4 (processing) when user returns from payment gateway
    if ($payment->payment_status == 0) {
        \DB::beginTransaction();
        try {
            \DB::table('payments')->where('order_id', $orderId)->update(['payment_status' => 4, 'updated_at' => \Carbon\Carbon::now()]);
            
            // Create processing transaction (without adding to wallet)
            \DB::table('transactions')->insert([
                'user_id' => $payment->user_id,
                'contest_id' => null,
                'type' => 'deposit',
                'amount' => $payment->amount,
                'transaction_id' => $orderId,
                'status' => 'pending',
                'description' => 'Payment processing - Awaiting confirmation',
                'created_at' => \Carbon\Carbon::now(),
                'updated_at' => \Carbon\Carbon::now()
            ]);
            
            \DB::commit();
        } catch (\Exception $e) {
            \DB::rollBack();
        }
    }
    
    // Check if payment was created in last 15 minutes
    $paymentAge = \Carbon\Carbon::parse($payment->created_at)->diffInMinutes(\Carbon\Carbon::now());
    if ($paymentAge > 15) {
        return response()->json(['success' => false, 'message' => 'Payment verification expired']);
    }
    
    // Query LG Pay to verify actual payment status
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
    
    if ($httpCode != 200) {
        return response()->json(['success' => false, 'message' => 'Payment gateway error', 'payment_status' => 4]);
    }
    
    $result = json_decode($response, true);
    
    // Only update if LG Pay confirms payment success
    if ($result && isset($result['status']) && $result['status'] == 1 && isset($result['data']['status']) && $result['data']['status'] == 1) {
        \DB::beginTransaction();
        try {
            \DB::table('payments')->where('order_id', $orderId)->update(['payment_status' => 1, 'updated_at' => \Carbon\Carbon::now()]);
            \DB::table('users')->where('id', $payment->user_id)->increment('deposit_balance', $payment->amount);
            
            // Update existing pending transaction to success
            $updated = \DB::table('transactions')
                ->where('transaction_id', $orderId)
                ->where('status', 'pending')
                ->update([
                    'status' => 'success',
                    'description' => 'Deposit via LG Pay - Confirmed',
                    'updated_at' => \Carbon\Carbon::now()
                ]);
            
            // If no pending transaction exists, create new one
            if (!$updated) {
                \DB::table('transactions')->insert([
                    'user_id' => $payment->user_id,
                    'contest_id' => null,
                    'type' => 'deposit',
                    'amount' => $payment->amount,
                    'transaction_id' => $orderId,
                    'status' => 'success',
                    'description' => 'Deposit via LG Pay',
                    'created_at' => \Carbon\Carbon::now(),
                    'updated_at' => \Carbon\Carbon::now()
                ]);
            }
            
            \DB::commit();
            
            $user = \DB::table('users')->where('id', $payment->user_id)->first();
            return response()->json(['success' => true, 'payment_status' => 1, 'balance' => $user->deposit_balance ?? 0]);
        } catch (\Exception $e) {
            \DB::rollBack();
            return response()->json(['success' => false, 'message' => $e->getMessage()]);
        }
    }
    
    return response()->json(['success' => false, 'payment_status' => 4, 'message' => 'Payment confirmation pending']);
});

Route::get('/check-payment-status', function(\Illuminate\Http\Request $request) {
    $orderId = $request->query('order_id');
    
    if (!$orderId) {
        return response()->json(['success' => false, 'message' => 'Order ID required']);
    }
    
    $payment = \DB::table('payments')->where('order_id', $orderId)->first();
    
    if (!$payment) {
        return response()->json(['success' => false, 'message' => 'Payment not found']);
    }
    
    return response()->json([
        'success' => true,
        'payment_status' => $payment->payment_status,
        'amount' => $payment->amount,
        'status_text' => $payment->payment_status == 1 ? 'Success' : ($payment->payment_status == -1 ? 'Failed' : 'Pending')
    ]);
});

Route::get('/check-latest-payment', function(\Illuminate\Http\Request $request) {
    $userId = $request->query('user_id');
    
    if (!$userId) {
        return response()->json(['success' => false, 'message' => 'User ID required']);
    }
    
    // Auto-cancel old pending payments (older than 15 minutes)
    \DB::table('payments')
        ->where('user_id', $userId)
        ->whereIn('payment_status', [0, 4])
        ->where('created_at', '<', \Carbon\Carbon::now()->subMinutes(15))
        ->update(['payment_status' => -1, 'updated_at' => \Carbon\Carbon::now()]);
    
    $payment = \DB::table('payments')->where('user_id', $userId)->orderBy('created_at', 'desc')->first();
    
    if (!$payment) {
        return response()->json(['success' => false, 'message' => 'No payment found']);
    }
    
    $user = \DB::table('users')->where('id', $userId)->first();
    
    $statusText = match($payment->payment_status) {
        1 => 'Success',
        -1 => 'Failed',
        4 => 'Processing',
        default => 'Pending'
    };
    
    return response()->json([
        'success' => true,
        'payment_status' => $payment->payment_status,
        'amount' => $payment->amount,
        'order_id' => $payment->order_id,
        'balance' => $user->deposit_balance ?? 0,
        'status_text' => $statusText
    ]);
});

// LG Pay Payment Routes (Public - No Auth)
Route::get('/payment/create-order', [\App\Http\Controllers\Api\PaymentController::class, 'createOrder']);
Route::get('admin/public/payment/create-order', [\App\Http\Controllers\Api\PaymentController::class, 'createOrder']);
Route::post('/payment/lgpay-callback', [\App\Http\Controllers\Api\PaymentController::class, 'lgpayCallback']);
Route::post('admin/public/lgpay-callback', [\App\Http\Controllers\Api\PaymentController::class, 'lgpayCallback']);

// Payment return handler - verifies and updates wallet before redirecting to app
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

// Manual payment status update for testing
Route::get('/payment/manual-update/{orderId}/{status}', function($orderId, $status) {
    $order = \DB::table('payments')->where('order_id', $orderId)->first();
    
    if (!$order) {
        return response()->json(['error' => 'Order not found']);
    }
    
    \DB::beginTransaction();
    try {
        \DB::table('payments')->where('order_id', $orderId)->update([
            'payment_status' => $status,
            'updated_at' => \Carbon\Carbon::now()
        ]);
        
        if ($status == 1) {
            \DB::table('users')->where('id', $order->user_id)->increment('deposit_balance', $order->amount);
            \DB::table('transactions')->insert([
                'user_id' => $order->user_id,
                'type' => 'deposit',
                'amount' => $order->amount,
                'transaction_id' => $orderId,
                'description' => 'Manual deposit update',
                'created_at' => \Carbon\Carbon::now(),
                'updated_at' => \Carbon\Carbon::now()
            ]);
        }
        
        \DB::commit();
        return response()->json(['success' => true, 'message' => 'Payment updated']);
    } catch (\Exception $e) {
        \DB::rollBack();
        return response()->json(['error' => $e->getMessage()]);
    }
});

// Public API routes for frontend (no auth required)
Route::get('admin/api/categories/{type}', function($type) {
    $categories = \App\Models\MarketTypeCategory::where('category_type', $type)
        ->where('status', 'active')
        ->get(['id', 'name']);
    return response()->json($categories);
});

Route::get('admin/api/assets/{categoryId}', function($categoryId) {
    $assets = \App\Models\Asset::where('category_id', $categoryId)
        ->where('status', 'active')
        ->get(['id', 'name', 'symbol', 'image_url']);
    return response()->json($assets);
});

Route::get('admin/api/saved-basket/{basketId}', function($basketId) {
    $basket = \DB::table('saved_baskets')
        ->leftJoin('users', 'saved_baskets.user_id', '=', 'users.id')
        ->leftJoin('contests', 'saved_baskets.contest_id', '=', 'contests.id')
        ->select(
            'saved_baskets.*',
            'users.name as user_name',
            'users.mobile as user_mobile',
            'contests.name as contest_name'
        )
        ->where('saved_baskets.id', $basketId)
        ->first();
        
    if (!$basket) {
        return response()->json(['error' => 'Basket not found'], 404);
    }
    
    $assets = json_decode($basket->assets, true) ?? [];
    $multipliers = json_decode($basket->multipliers, true) ?? [];
    $startingPrices = json_decode($basket->starting_prices, true) ?? [];
    
    $assetDetails = [];
    $totalScore = 0;
    
    foreach ($assets as $index => $asset) {
        $symbol = $asset['symbol'];
        $multiplier = $multipliers[$index] ?? 1;
        $startPrice = $startingPrices[$symbol] ?? 1000;
        
        // Simulate current price
        $basePrice = 1000;
        $variation = rand(-20, 20);
        $currentPrice = $basePrice + ($basePrice * $variation / 100);
        
        $percentChange = (($currentPrice - $startPrice) / $startPrice) * 100;
        $score = $percentChange * $multiplier;
        $totalScore += $score;
        
        $assetDetails[] = [
            'symbol' => $symbol,
            'name' => $asset['name'] ?? $symbol,
            'multiplier' => $multiplier,
            'start_price' => $startPrice,
            'current_price' => $currentPrice,
            'percent_change' => round($percentChange, 2),
            'score' => round($score, 2),
            'status' => $score > 0 ? 'profit' : ($score < 0 ? 'loss' : 'neutral')
        ];
    }
    
    return response()->json([
        'basket_id' => $basketId,
        'user_name' => $basket->user_name,
        'user_mobile' => $basket->user_mobile,
        'contest_name' => $basket->contest_name,
        'total_score' => round($totalScore, 2),
        'assets' => $assetDetails,
        'created_at' => $basket->created_at
    ]);
});

Route::get('admin/api/user-basket/{userId}/{contestId}', [\App\Http\Controllers\Admin\PerformanceController::class, 'getUserBasket']);

Route::get('admin/api/test', function() {
    return response()->json(['status' => 'working']);
});

Route::get('admin/api/live-prices', [\App\Http\Controllers\ApiController::class, 'livePrices']);
Route::post('admin/api/live-prices', [\App\Http\Controllers\ApiController::class, 'getAssetPrices']);
Route::post('api/save-start-prices', [\App\Http\Controllers\ApiController::class, 'saveStartPrices']);
Route::post('api/save-end-prices', [\App\Http\Controllers\ApiController::class, 'saveEndPrices']);
Route::post('api/calculate-results', [\App\Http\Controllers\ApiController::class, 'calculateResults']);

// Live Price API Routes - Optimized
Route::get('api/batch-live-prices', [\App\Http\Controllers\Api\OptimizedLivePriceController::class, 'getBatchLivePrices']);
Route::get('api/single-asset-price', [\App\Http\Controllers\Api\OptimizedLivePriceController::class, 'getSingleAssetPrice']);
Route::post('api/clear-price-cache', [\App\Http\Controllers\Api\OptimizedLivePriceController::class, 'clearCache']);
Route::get('api/price-cache-status', [\App\Http\Controllers\Api\OptimizedLivePriceController::class, 'getCacheStatus']);

// Legacy Live Price API Routes (keep for backward compatibility)
Route::get('api/live-prices', [\App\Http\Controllers\Api\LivePriceController::class, 'getLivePrices']);
Route::get('api/stock-live-price', [\App\Http\Controllers\Api\LivePriceController::class, 'getStockLivePrice']);
Route::get('api/crypto-live-price', [\App\Http\Controllers\Api\LivePriceController::class, 'getCryptoLivePrice']);

Route::get('admin/api/portfolios/{sessionId}', function($sessionId) {
    $portfolios = \App\Models\Portfolio::where('league_session_id', $sessionId)
        ->with(['user:id,name,email', 'portfolioAssets.asset:id,symbol,name'])
        ->get();
    return response()->json($portfolios);
});

Route::get('admin/api/sessions/{sessionId}', function($sessionId) {
    $session = \App\Models\LeagueSession::find($sessionId);
    return response()->json($session);
});

Route::get('admin/api/stocks-by-category', function() {
    $categories = \App\Models\MarketTypeCategory::where('category_type', 'stock')
        ->where('status', 'active')
        ->with(['assets' => function($query) {
            $query->where('status', 'active')->select('id', 'symbol', 'name', 'image_url', 'category_id');
        }])
        ->get(['id', 'name']);
    return response()->json($categories);
});

// Route::get('api/league-session-assets/{sessionId}', function($sessionId) {
//     $assets = \Illuminate\Support\Facades\DB::table('league_session_assets')
//         ->join('assets', 'league_session_assets.asset_symbol', '=', 'assets.symbol')
//         ->join('market_type_categories', 'league_session_assets.category_id', '=', 'market_type_categories.id')
//         ->where('league_session_assets.league_session_id', $sessionId)
//         ->select('assets.*', 'market_type_categories.name as category_name', 'market_type_categories.id as category_id')
//         ->get()
//         ->groupBy('category_name');
//     return response()->json($assets);
// });

Route::get('api/stocks-by-category', function() {
    $categories = \App\Models\MarketTypeCategory::where('category_type', 'stock')
        ->where('status', 'active')
        ->with(['assets' => function($query) {
            $query->where('status', 'active')->select('id', 'symbol', 'name', 'image_url', 'category_id');
        }])
        ->get(['id', 'name']);
    return response()->json($categories);
});

Route::get('api/contests/{contestId}', function($contestId) {
    $contest = \App\Models\Contest::find($contestId);
    if (!$contest) {
        return response()->json(['error' => 'Contest not found'], 404);
    }
    return response()->json($contest);
});

Route::get('api/live-sessions-data', [\App\Http\Controllers\Admin\LiveManagementController::class, 'getLiveSessionsData']);
Route::get('api/session-contests/{sessionId}', [\App\Http\Controllers\Admin\PerformanceController::class, 'getSessionContests']);
Route::get('api/live-contests-count', function() {
    $count = \App\Models\Contest::whereHas('leagueSession', function($query) {
        $query->where('status', 'live');
    })->count();
    return response()->json(['count' => $count]);
});

// Empty Test Transactions
Route::delete('api/empty-test-transactions', function() {
    try {
        $deletedCount = \DB::table('test_transactions')->count();
        \DB::table('test_transactions')->truncate();
        
        return response()->json([
            'success' => true,
            'message' => 'All test transactions deleted',
            'deleted_count' => $deletedCount
        ]);
    } catch (\Exception $e) {
        return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
    }
});

// Get Test Transactions Ranked
Route::get('api/test-transactions-ranked/{contestId}', function($contestId) {
    $transactions = \DB::table('test_transactions')
        ->leftJoin('contest_entries', function($join) use ($contestId) {
            $join->on('test_transactions.user_id', '=', 'contest_entries.user_id')
                 ->where('contest_entries.contest_id', '=', $contestId);
        })
        ->leftJoin('users', 'test_transactions.user_id', '=', 'users.id')
        ->where('test_transactions.contest_id', $contestId)
        ->select(
            'test_transactions.*',
            'users.name as user_name',
            'contest_entries.total_score as score'
        )
        ->orderBy('contest_entries.total_score', 'desc')
        ->get()
        ->map(function($transaction, $index) {
            $transaction->rank = $index + 1;
            return $transaction;
        });
    
    return response()->json(['transactions' => $transactions]);
});

// Get Test Transactions
Route::get('api/test-transactions', function() {
    $transactions = \DB::table('test_transactions')
        ->orderBy('created_at', 'desc')
        ->limit(100)
        ->get();
    return response()->json(['transactions' => $transactions]);
});

// Test Transaction Route
Route::post('api/test-transaction/{sessionId}', function($sessionId) {
    try {
        $session = \DB::table('league_sessions')->where('id', $sessionId)->first();
        if (!$session) {
            return response()->json(['success' => false, 'message' => 'Session not found'], 404);
        }
        
        $transactionId = 'TEST_' . strtoupper(uniqid());
        
        \DB::table('transactions')->insert([
            'user_id' => 1,
            'contest_id' => null,
            'type' => 'test',
            'amount' => 100.00,
            'transaction_id' => $transactionId,
            'status' => 'success',
            'description' => 'Test transaction for session ' . $session->name,
            'created_at' => \Carbon\Carbon::now(),
            'updated_at' => \Carbon\Carbon::now()
        ]);
        
        return response()->json([
            'success' => true,
            'message' => 'Test transaction created',
            'transaction_id' => $transactionId,
            'session_id' => $sessionId,
            'session_name' => $session->name
        ]);
    } catch (\Exception $e) {
        return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
    }
});

// Test Transaction Route
Route::post('api/test-transaction/{sessionId}', function($sessionId) {
    try {
        $session = \DB::table('league_sessions')->where('id', $sessionId)->first();
        if (!$session) {
            return response()->json(['success' => false, 'message' => 'Session not found'], 404);
        }
        
        $transactionId = 'TEST_' . strtoupper(uniqid());
        
        \DB::table('transactions')->insert([
            'user_id' => 1,
            'contest_id' => null,
            'type' => 'test',
            'amount' => 100.00,
            'transaction_id' => $transactionId,
            'status' => 'success',
            'description' => 'Test transaction for session ' . $session->name,
            'created_at' => \Carbon\Carbon::now(),
            'updated_at' => \Carbon\Carbon::now()
        ]);
        
        return response()->json([
            'success' => true,
            'message' => 'Test transaction created',
            'transaction_id' => $transactionId,
            'session_id' => $sessionId,
            'session_name' => $session->name
        ]);
    } catch (\Exception $e) {
        return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
    }
});

// Test Transaction for Contest
Route::post('api/test-transaction-contest/{contestId}', function($contestId) {
    try {
        $contest = \DB::table('contests')->where('id', $contestId)->first();
        if (!$contest) {
            return response()->json(['success' => false, 'message' => 'Contest not found'], 404);
        }
        
        $transactionId = 'TEST_' . strtoupper(uniqid());
        
        \DB::table('test_transactions')->insert([
            'user_id' => 1,
            'contest_id' => $contestId,
            'type' => 'test',
            'amount' => 100.00,
            'transaction_id' => $transactionId,
            'status' => 'success',
            'description' => 'Test transaction for contest #' . $contestId,
            'created_at' => \Carbon\Carbon::now(),
            'updated_at' => \Carbon\Carbon::now()
        ]);
        
        return response()->json([
            'success' => true,
            'message' => 'Test transaction created',
            'transaction_id' => $transactionId,
            'contest_id' => $contestId
        ]);
    } catch (\Exception $e) {
        return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
    }
});

// Insert Test Transactions for All Leaderboard Users
Route::post('api/insert-leaderboard-test-transactions/{contestId}', function($contestId) {
    try {
        // Add a simple lock mechanism to prevent concurrent executions
        $lockKey = 'test_transactions_' . $contestId;
        $lockFile = storage_path('app/' . $lockKey . '.lock');
        
        if (file_exists($lockFile)) {
            return response()->json([
                'success' => false, 
                'message' => 'Test transaction creation already in progress for this contest'
            ], 429);
        }
        
        // Create lock file
        file_put_contents($lockFile, time());
        
        $contest = \DB::table('contests')->where('id', $contestId)->first();
        if (!$contest) {
            unlink($lockFile);
            return response()->json(['success' => false, 'message' => 'Contest not found'], 404);
        }
        
        // Check if test transactions already exist for this contest
        $existingCount = \DB::table('test_transactions')
            ->where('contest_id', $contestId)
            ->where('type', 'test_leaderboard')
            ->count();
            
        if ($existingCount > 0) {
            unlink($lockFile);
            return response()->json([
                'success' => false, 
                'message' => 'Test transactions already exist for this contest. Use "Empty Test Transactions" first.'
            ], 400);
        }
        
        // Get all participants from leaderboard
        $participants = \DB::table('contest_entries')
            ->leftJoin('users', 'contest_entries.user_id', '=', 'users.id')
            ->where('contest_entries.contest_id', $contestId)
            ->select(
                'contest_entries.*',
                'users.name as user_name',
                'users.mobile as user_mobile'
            )
            ->orderBy('contest_entries.total_score', 'desc')
            ->get();
        
        // Get prize distribution
        $prizes = \DB::table('contest_performance_prizes')
            ->where('contest_id', $contestId)
            ->orderBy('rank_start')
            ->get();
        
        $totalTransactions = 0;
        $transactionsToInsert = [];
        
        foreach ($participants as $index => $participant) {
            $rank = $index + 1;
            
            // Find prize amount for this rank
            $prizeAmount = 0;
            foreach ($prizes as $prize) {
                if ($rank >= $prize->rank_start && $rank <= $prize->rank_end) {
                    $prizeAmount = $prize->per_winner_amount;
                    break;
                }
            }
            
            // Only create transaction if there's a prize
            if ($prizeAmount > 0) {
                $transactionId = 'TEST_LEADER_' . $contestId . '_' . $participant->user_id . '_' . time() . '_' . $rank;
                
                $transactionsToInsert[] = [
                    'user_id' => $participant->user_id,
                    'contest_id' => $contestId,
                    'type' => 'test_leaderboard',
                    'amount' => $prizeAmount,
                    'transaction_id' => $transactionId,
                    'status' => 'success',
                    'description' => 'Test transaction for leaderboard rank ' . $rank . ' prize in contest #' . $contestId,
                    'created_at' => \Carbon\Carbon::now(),
                    'updated_at' => \Carbon\Carbon::now()
                ];
                
                $totalTransactions++;
            }
        }
        
        // Batch insert all transactions at once
        if (!empty($transactionsToInsert)) {
            \DB::table('test_transactions')->insert($transactionsToInsert);
        }
        
        // Remove lock file
        unlink($lockFile);
        
        return response()->json([
            'success' => true,
            'message' => 'Test transactions created for all leaderboard winners',
            'total_transactions' => $totalTransactions,
            'contest_id' => $contestId
        ]);
    } catch (\Exception $e) {
        // Clean up lock file on error
        $lockFile = storage_path('app/test_transactions_' . $contestId . '.lock');
        if (file_exists($lockFile)) {
            unlink($lockFile);
        }
        
        return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
    }
});

// Distribute Winnings
Route::post('api/distribute-winnings/{contestId}', function($contestId) {
    try {
        $contest = \DB::table('contests')->where('id', $contestId)->first();
        if (!$contest) {
            return response()->json(['success' => false, 'message' => 'Contest not found'], 404);
        }
        
        $entries = \DB::table('contest_entries')
            ->where('contest_id', $contestId)
            ->orderBy('total_score', 'desc')
            ->get();
        
        $prizes = \DB::table('contest_performance_prizes')
            ->where('contest_id', $contestId)
            ->orderBy('rank_start')
            ->get();
        
        $totalWinners = 0;
        $totalAmount = 0;
        
        foreach ($entries as $index => $entry) {
            $rank = $index + 1;
            
            foreach ($prizes as $prize) {
                if ($rank >= $prize->rank_start && $rank <= $prize->rank_end) {
                    $amount = $prize->per_winner_amount;
                    
                    \DB::table('transactions')->insert([
                        'user_id' => $entry->user_id,
                        'contest_id' => $contestId,
                        'type' => 'winnings',
                        'amount' => $amount,
                        'transaction_id' => 'WIN_' . $contestId . '_' . $entry->id,
                        'status' => 'success',
                        'description' => 'Contest #' . $contestId . ' - Rank ' . $rank . ' prize',
                        'created_at' => \Carbon\Carbon::now(),
                        'updated_at' => \Carbon\Carbon::now()
                    ]);
                    
                    \DB::table('users')->where('id', $entry->user_id)->increment('winnings_balance', $amount);
                    
                    $totalWinners++;
                    $totalAmount += $amount;
                    break;
                }
            }
        }
        
        return response()->json([
            'success' => true,
            'message' => 'Winnings distributed',
            'total_winners' => $totalWinners,
            'total_amount' => $totalAmount
        ]);
    } catch (\Exception $e) {
        return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
    }
});

// Route::post('api/save-basket', function(\Illuminate\Http\Request $request) {
//     $data = $request->validate([
//         'user_id' => 'nullable|integer',
//         'contest_id' => 'required|integer',
//         'assets' => 'required|array',
//         'multipliers' => 'required|array',
//         'total_score' => 'nullable|numeric'
//     ]);
    
//     $basket = \App\Models\SavedBasket::create([
//         'user_id' => $data['user_id'] ?? null,
//         'contest_id' => $data['contest_id'],
//         'assets' => $data['assets'],
//         'multipliers' => $data['multipliers'],
//         'total_score' => $data['total_score'] ?? 0
//     ]);
    
//     return response()->json([
//         'success' => true, 
//         'message' => 'Basket saved successfully',
//         'basket_id' => $basket->id,
//         'data' => $basket
//     ]);
// });

Route::get('update-sessions', function() {
    $now = \Carbon\Carbon::now();
    
    // Get sessions that should be updated
    $upcomingSessions = \App\Models\LeagueSession::where('status', 'upcoming')
        ->select('id', 'name', 'status', 'start_time', 'end_time')
        ->get();
        
    $liveSessions = \App\Models\LeagueSession::where('status', 'live')
        ->select('id', 'name', 'status', 'start_time', 'end_time')
        ->get();
    
    // Update to live
    $updated = \App\Models\LeagueSession::where('status', 'upcoming')
        ->whereRaw('start_time <= ?', [$now->format('Y-m-d H:i:s')])
        ->whereRaw('end_time > ?', [$now->format('Y-m-d H:i:s')])
        ->update(['status' => 'live']);
        
    // Update to completed
    $completed = \App\Models\LeagueSession::where('status', 'live')
        ->whereRaw('end_time <= ?', [$now->format('Y-m-d H:i:s')])
        ->update(['status' => 'completed']);
        
    return response()->json([
        'server_time' => $now->format('Y-m-d H:i:s'),
        'timezone' => $now->timezoneName,
        'updated_to_live' => $updated,
        'updated_to_completed' => $completed,
        'upcoming_sessions' => $upcomingSessions->map(function($s) use ($now) {
            return [
                'id' => $s->id,
                'name' => $s->name,
                'start_time' => $s->start_time,
                'should_be_live' => $s->start_time <= $now->format('Y-m-d H:i:s')
            ];
        }),
        'live_sessions' => $liveSessions->map(function($s) use ($now) {
            return [
                'id' => $s->id,
                'name' => $s->name,
                'end_time' => $s->end_time,
                'should_be_completed' => $s->end_time <= $now->format('Y-m-d H:i:s')
            ];
        })
    ]);
});

Route::prefix('admin')->name('admin.')->group(function () {






     Route::get('/login', [LoginController::class, 'showLoginForm'])->name('login');
    // Admin authentication routes (accessible to guests)
    Route::middleware('guest:admin')->group(function () {
       
        Route::post('/login', [LoginController::class, 'login']);
    });


    // Protected admin routes
    Route::middleware(['auth:admin'])->group(function () {
    Route::get('profile/show', [\App\Http\Controllers\Admin\ProfileController::class, 'show'])->name('profile.show');
        Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');
        Route::get('/cron-logs', [\App\Http\Controllers\Admin\CronLogController::class, 'index'])->name('cron-logs.index');
        Route::delete('/cron-logs/clear', [\App\Http\Controllers\Admin\CronLogController::class, 'destroyAll'])->name('cron-logs.clear');


    Route::resource('users', UserController::class);
    Route::resource('payments', \App\Http\Controllers\Admin\PaymentController::class)->only(['index']);
    Route::post('payments/{id}/approve', [\App\Http\Controllers\Admin\PaymentController::class, 'approve'])->name('payments.approve');
    Route::post('payments/{id}/reject', [\App\Http\Controllers\Admin\PaymentController::class, 'reject'])->name('payments.reject');
    Route::post('payments/{id}/verify', [\App\Http\Controllers\Admin\PaymentController::class, 'verify'])->name('payments.verify');
    Route::post('users/{user}/impersonate', [UserController::class, 'impersonate'])->name('users.impersonate');
    Route::delete('users/bulk-delete', [UserController::class, 'bulkDelete'])->name('users.bulk-delete');
    Route::post('users/{user}/wallet/add', [UserController::class, 'addToWallet'])->name('users.wallet.add');
    Route::post('users/{user}/wallet/remove', [UserController::class, 'removeFromWallet'])->name('users.wallet.remove');
    Route::post('league_sessions/update-status', [App\Http\Controllers\Admin\LeagueSessionController::class, 'updateStatus'])->name('league_sessions.update_status');
    Route::post('league_sessions/test-update', [App\Http\Controllers\Admin\LeagueSessionController::class, 'testUpdate'])->name('league_sessions.test_update');
    Route::post('league_sessions/fix-years', [App\Http\Controllers\Admin\LeagueSessionController::class, 'fixYears'])->name('league_sessions.fix_years');
    Route::get('league_sessions/template/{id}', [App\Http\Controllers\Admin\LeagueSessionController::class, 'getTemplate'])->name('league_sessions.get_template');
    Route::get('performance/{id}', [\App\Http\Controllers\Admin\PerformanceController::class, 'show'])->name('performance.show');
    Route::get('performance/contest/{contestId}', [\App\Http\Controllers\Admin\PerformanceController::class, 'showContest'])->name('performance.contest');
    Route::get('performance/{id}/live', [\App\Http\Controllers\Admin\PerformanceController::class, 'liveData'])->name('performance.live');
    Route::get('performance/{id}/user-baskets', [\App\Http\Controllers\Admin\PerformanceController::class, 'userBaskets'])->name('performance.user-baskets');
    Route::resource('templates', App\Http\Controllers\Admin\TemplateController::class)->only(['index', 'edit', 'update', 'destroy']);
    // Contest CRUD supports types: Mega Contest (dynamic), Equal Prize, Guaranteed (fixed), Practice (fixed/free)
    Route::resource('contests', App\Http\Controllers\Admin\ContestController::class);
    Route::post('contests/bulk-delete', [App\Http\Controllers\Admin\ContestController::class, 'bulkDelete'])->name('contests.bulk_delete');
    Route::post('contests/{id}/cancel', [App\Http\Controllers\Admin\ContestController::class, 'cancelContest'])->name('contests.cancel');
    Route::post('contests/{id}/status', [App\Http\Controllers\Admin\ContestController::class, 'updateStatus'])->name('contests.update-status');
    Route::get('contests/{id}/export', [App\Http\Controllers\Admin\ContestController::class, 'exportParticipants'])->name('contests.export-participants');
    Route::post('contests/{id}/pin', [App\Http\Controllers\Admin\ContestController::class, 'togglePin'])->name('contests.pin');
    Route::get('live-management', [\App\Http\Controllers\Admin\LiveManagementController::class, 'index'])->name('live-management');
   
   
    Route::get('admin/api/contest-details/{id}', [\App\Http\Controllers\Admin\LiveManagementController::class, 'getContestDetails']);
    Route::get('api/session-leaderboard/{id}', [\App\Http\Controllers\Admin\LiveManagementController::class, 'getSessionLeaderboard']);
    Route::post('api/start-session/{id}', [\App\Http\Controllers\Admin\SessionStatusController::class, 'startSession']);
    Route::post('api/end-session/{id}', [\App\Http\Controllers\Admin\SessionStatusController::class, 'endSession']);
    Route::post('api/manual-complete-session/{id}', [\App\Http\Controllers\Admin\LiveManagementController::class, 'manualCompleteSession']);
    Route::post('api/fix-orphaned-contests', [\App\Http\Controllers\Admin\LiveManagementController::class, 'fixOrphanedContests']);

    Route::get('live-contest-detail/{contestId}', [\App\Http\Controllers\Admin\LiveManagementController::class, 'showContestDetail'])->name('live-contest-detail');
    Route::get('session-contests/{sessionId}', [\App\Http\Controllers\Admin\LiveManagementController::class, 'showSessionContests'])->name('session-contests');
    Route::get('api/portfolio-details/{basketId}', [\App\Http\Controllers\Admin\LiveManagementController::class, 'getPortfolioDetails']);
   
    Route::resource('withdrawal_requests', \App\Http\Controllers\Admin\WithdrawalRequestController::class);
        Route::resource('portfolios', PortfolioController::class);
        Route::resource('saved-baskets', App\Http\Controllers\Admin\SavedBasketController::class)->only(['index', 'show', 'destroy']);
        Route::post('saved-baskets/bulk-delete', [App\Http\Controllers\Admin\SavedBasketController::class, 'bulkDelete'])->name('saved-baskets.bulk-delete');
        Route::resource('entries', EntryController::class);
        Route::resource('transactions', TransactionController::class);
        Route::post('transactions/{id}/approve', [TransactionController::class, 'approve'])->name('transactions.approve');
        Route::post('transactions/{id}/reject', [TransactionController::class, 'reject'])->name('transactions.reject');
        Route::resource('kyc', KycController::class);
    Route::post('kyc/{kyc}/approve', [KycController::class, 'approve'])->name('kyc.approve');
    Route::post('kyc/{kyc}/reject', [KycController::class, 'reject'])->name('kyc.reject');
        Route::resource('tickets', TicketController::class)->only(['index', 'show']);
        Route::post('tickets/{ticket}/reply', [TicketController::class, 'reply'])->name('tickets.reply');
        Route::post('tickets/{ticket}/close', [TicketController::class, 'close'])->name('tickets.close');
        Route::resource('announcements', AnnouncementController::class);
        Route::post('announcements/bulk-delete', [AnnouncementController::class, 'bulkDelete'])->name('announcements.bulk-delete');
        Route::get('live-price-feeds', [LivePriceFeedController::class, 'index'])->name('live-price-feeds.index');
        Route::get('live-price-feeds/stocks', [LivePriceFeedController::class, 'getStockData']);
        Route::get('live-price-feeds/cryptos', [LivePriceFeedController::class, 'getCryptoData']);
        Route::get('ajax/stock-data', [LivePriceFeedController::class, 'getStockData']);
        Route::get('ajax/crypto-data', [LivePriceFeedController::class, 'getCryptoData']);
        Route::get('league-session-assets/{id}', [App\Http\Controllers\Admin\LeagueSessionController::class, 'getSessionAssets']);
        
    // Profile Routes
    Route::get('profile', [\App\Http\Controllers\Admin\ProfileController::class, 'show'])->name('profile');
    Route::put('profile', [\App\Http\Controllers\Admin\ProfileController::class, 'update'])->name('profile.update');
        
        // Settings Routes
        Route::prefix('settings')->name('settings.')->group(function () {
            Route::get('/', [\App\Http\Controllers\Admin\SettingsController::class, 'index'])->name('index');
            Route::put('/password', [\App\Http\Controllers\Admin\SettingsController::class, 'updatePassword'])->name('password');
            Route::post('/payment', [\App\Http\Controllers\Admin\SettingsController::class, 'updatePayment'])->name('payment');
            Route::post('/terms', [\App\Http\Controllers\Admin\SettingsController::class, 'updateTerms'])->name('terms');
            Route::post('/privacy', [\App\Http\Controllers\Admin\SettingsController::class, 'updatePrivacy'])->name('privacy');
            Route::post('/about', [\App\Http\Controllers\Admin\SettingsController::class, 'updateAbout'])->name('about');
            Route::post('/payment-policy', [\App\Http\Controllers\Admin\SettingsController::class, 'updatePaymentPolicy'])->name('payment_policy');
        });


      

    Route::resource('banners', App\Http\Controllers\Admin\BannerController::class);
    Route::post('league_sessions/{id}/refetch-prices', [App\Http\Controllers\Admin\LeagueSessionController::class, 'refetchMissingPrices'])->name('league_sessions.refetch_prices');
    Route::post('api/fetch-prices-robust/{sessionId}', [App\Http\Controllers\Admin\LeagueSessionController::class, 'refetchMissingPrices']);
    Route::post('api/run-all/{contestId}', [App\Http\Controllers\Admin\RunAllController::class, 'runAll']);
    Route::get('api/run-all-log/{contestId}', [App\Http\Controllers\Admin\RunAllController::class, 'getLog']);
    Route::resource('league_sessions', App\Http\Controllers\Admin\LeagueSessionController::class);
    Route::post('league_sessions/bulk-delete', [App\Http\Controllers\Admin\LeagueSessionController::class, 'bulkDelete'])->name('league_sessions.bulk_delete');
    Route::get('league_sessions/{league_session}/view', [App\Http\Controllers\Admin\LeagueSessionController::class, 'show'])->name('league_sessions.show');
    Route::resource('market_type_categories', App\Http\Controllers\Admin\MarketTypeCategoryController::class);
    Route::get('utilities/sha1', [App\Http\Controllers\Admin\UtilityController::class, 'sha1Tool'])->name('utilities.sha1');
    Route::post('utilities/generate-sha1', [App\Http\Controllers\Admin\UtilityController::class, 'generateSha1'])->name('utilities.generate-sha1');

        
        // Referral Management Routes
        Route::prefix('referrals')->name('referrals.')->group(function () {
            Route::get('/', [\App\Http\Controllers\Admin\ReferralController::class, 'index'])->name('index');
            Route::get('/transactions', [\App\Http\Controllers\Admin\ReferralController::class, 'transactions'])->name('transactions');
            Route::get('/top-referrers', [\App\Http\Controllers\Admin\ReferralController::class, 'topReferrers'])->name('top-referrers');
            Route::get('/settings', [\App\Http\Controllers\Admin\ReferralController::class, 'settings'])->name('settings');
            Route::post('/settings', [\App\Http\Controllers\Admin\ReferralController::class, 'updateSettings'])->name('settings.update');
        });
        
        // Notification routes
        Route::get('/notifications', function() {
            return view('admin.send_notification');
        })->name('notifications');
        
        // Test notification route
        Route::get('/test-notification', function() {
            return view('test_notification');
        })->name('test-notification');
        

        
        // Logout route (moved here to be inside auth middleware)
        Route::post('/logout', [LoginController::class, 'logout'])->name('logout');
        
        // Contest Tracking Routes
        Route::prefix('contest-tracking')->name('contest-tracking.')->group(function () {
            Route::get('/', [\App\Http\Controllers\Admin\ContestTrackingController::class, 'index'])->name('index');
            Route::get('/{id}', [\App\Http\Controllers\Admin\ContestTrackingController::class, 'show'])->name('show');
            Route::post('/{id}/start', [\App\Http\Controllers\Admin\ContestTrackingController::class, 'startContest'])->name('start');
            Route::post('/{id}/end', [\App\Http\Controllers\Admin\ContestTrackingController::class, 'endContest'])->name('end');
        });
        
        // Contest Tracking API Routes
        Route::prefix('api')->name('api.')->group(function () {
            Route::get('/live-contests', [\App\Http\Controllers\Admin\ContestTrackingController::class, 'getLiveContests']);
            Route::get('/contest-stats/{id}', [\App\Http\Controllers\Admin\ContestTrackingController::class, 'getContestStats']);
        });
        
        // Performance Routes
        Route::prefix('performance')->name('performance.')->group(function () {
            Route::get('/', [\App\Http\Controllers\Admin\PerformanceController::class, 'index'])->name('index');
            Route::get('/sessions', [\App\Http\Controllers\Admin\PerformanceController::class, 'sessions'])->name('sessions');
            Route::get('/session/{sessionId}', [\App\Http\Controllers\Admin\PerformanceController::class, 'sessionDetail'])->name('session.detail');
            Route::get('/session/{sessionId}/contests', [\App\Http\Controllers\Admin\PerformanceController::class, 'sessionContests'])->name('session.contests');
            Route::get('/{id}', [\App\Http\Controllers\Admin\PerformanceController::class, 'show'])->name('show');
            Route::get('/{id}/analytics', [\App\Http\Controllers\Admin\PerformanceController::class, 'analytics'])->name('analytics');
            Route::get('/{id}/live', [\App\Http\Controllers\Admin\PerformanceController::class, 'liveData'])->name('live');
        });
        
        // Performance API Routes
        Route::get('api/session-contests/{sessionId}', [\App\Http\Controllers\Admin\PerformanceController::class, 'getSessionContests']);
        Route::get('api/sessions/{sessionId}', [\App\Http\Controllers\Admin\PerformanceController::class, 'getSessionDetails']);
        Route::get('api/performance/{contestId}/participants', [\App\Http\Controllers\Admin\PerformanceController::class, 'getParticipants']);
        Route::get('api/performance/{contestId}/prices', [\App\Http\Controllers\Admin\PerformanceController::class, 'getPrices']);
        Route::post('api/verify-historical-prices/{sessionId}', [\App\Http\Controllers\Admin\HistoricalPriceController::class, 'verifyHistoricalPrices']);
        Route::post('api/analyze-price-errors/{sessionId}', [\App\Http\Controllers\Admin\PriceErrorAnalysisController::class, 'analyzePriceErrors']);
        Route::post('api/save-flexible-structure', [\App\Http\Controllers\Admin\PerformanceController::class, 'saveFlexibleStructure']);
        Route::get('api/get-flexible-structure/{winnerCount}', [\App\Http\Controllers\Admin\PerformanceController::class, 'getFlexibleStructure']);
        Route::get('api/get-saved-structure/{contestId}', [\App\Http\Controllers\Admin\PerformanceController::class, 'getSavedStructure']);
        Route::post('api/update-scores-manual/{contestId}', [\App\Http\Controllers\Admin\PerformanceController::class, 'updateScoresManually']);

        // Phase buttons API routes
        Route::post('api/phase1-session-start/{sessionId}', function($sessionId) {
            try {
                $sessionController = new \App\Http\Controllers\Admin\LeagueSessionController();
                $pricingController  = new \App\Http\Controllers\Api\PricingController();
                $performanceController = new \App\Http\Controllers\Admin\PerformanceController();

                $session = \DB::table('league_sessions')->where('id', $sessionId)->first();
                if (!$session) return response()->json(['success' => false, 'message' => 'Session not found'], 404);

                // Start prices
                $sessionObj = \App\Models\LeagueSession::find($sessionId);
                $sessionController->saveSessionAssetStartPrices($sessionObj);

                // Contests live + prize structure
                $contests = \DB::table('contests')
                    ->where('league_session_id', $sessionId)
                    ->whereNotIn('status', ['cancelled', 'completed'])
                    ->get();

                $results = [];
                foreach ($contests as $contest) {
                    \DB::table('contests')->where('id', $contest->id)->update(['status' => 'live']);
                    $participants = \DB::table('contest_entries')->where('contest_id', $contest->id)->count();
                    if ($participants > 0) {
                        $prizeData = $pricingController->flexiblePricing(new \Illuminate\Http\Request([
                            'participants'       => $participants,
                            'entry_fee'          => $contest->entry_fee,
                            'platform_fee'       => $contest->platform_fee,
                            'winning_percentage' => $contest->winning_percentage ?? 30,
                            'category'           => $contest->category
                        ]));
                        $apiData = json_decode($prizeData->getContent(), true);
                        $performanceController->saveApiStructure(new \Illuminate\Http\Request([
                            'contest_id'   => $contest->id,
                            'participants' => $participants,
                            'api_data'     => $apiData
                        ]));
                        $results[] = "Contest {$contest->id}: prize structure saved ({$participants} participants)";
                    } else {
                        $results[] = "Contest {$contest->id}: no participants, prize structure skipped";
                    }
                }

                $startPricesCount = \DB::table('session_asset_prices')
                    ->where('league_session_id', $sessionId)
                    ->whereNotNull('start_price')
                    ->count();

                return response()->json([
                    'success' => true,
                    'message' => 'Phase 1 complete',
                    'start_prices_saved' => $startPricesCount,
                    'contests' => $results
                ]);
            } catch (\Exception $e) {
                return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
            }
        });

        Route::post('api/phase2-live-scores/{sessionId}', function($sessionId) {
            try {
                $sessionController  = new \App\Http\Controllers\Admin\LeagueSessionController();
                $calculateController = new \App\Http\Controllers\Api\CalculateController();

                $sessionObj = \App\Models\LeagueSession::find($sessionId);
                if (!$sessionObj) return response()->json(['success' => false, 'message' => 'Session not found'], 404);

                $sessionController->saveSessionAssetEndPrices($sessionObj);

                $contests = \DB::table('contests')
                    ->where('league_session_id', $sessionId)
                    ->whereNotIn('status', ['cancelled', 'completed'])
                    ->get();

                $results = [];
                foreach ($contests as $contest) {
                    $response = $calculateController->calculateResults(new \Illuminate\Http\Request([
                        'contest_id'    => $contest->id,
                        'credit_wallet' => false
                    ]));
                    $data = json_decode($response->getContent(), true);
                    $results[] = "Contest {$contest->id}: " . ($data['message'] ?? 'done');
                }

                $endPricesCount = \DB::table('session_asset_prices')
                    ->where('league_session_id', $sessionId)
                    ->whereNotNull('end_price')
                    ->count();

                return response()->json([
                    'success' => true,
                    'message' => 'Phase 2 complete — scores updated, no wallet credit',
                    'end_prices_updated' => $endPricesCount,
                    'contests' => $results
                ]);
            } catch (\Exception $e) {
                return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
            }
        });

        Route::post('api/run-calculation/{contestId}', function($contestId) {
            try {
                $calculateController = new \App\Http\Controllers\Api\CalculateController();
                $response = $calculateController->calculateResults(new \Illuminate\Http\Request([
                    'contest_id'    => $contestId,
                    'credit_wallet' => false
                ]));
                $data = json_decode($response->getContent(), true);
                return response()->json($data);
            } catch (\Exception $e) {
                return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
            }
        });

        Route::post('api/declare-result/{contestId}', function($contestId) {
            try {
                $contest = \DB::table('contests')->where('id', $contestId)->first();
                if (!$contest) return response()->json(['success' => false, 'message' => 'Contest not found'], 404);

                if ($contest->is_calculated) {
                    return response()->json(['success' => false, 'message' => 'Result already declared for this contest']);
                }

                $calculateController = new \App\Http\Controllers\Api\CalculateController();
                $response = $calculateController->calculateResults(new \Illuminate\Http\Request([
                    'contest_id'    => $contestId,
                    'credit_wallet' => true
                ]));
                $data = json_decode($response->getContent(), true);

                if ($data['success'] ?? false) {
                    \DB::table('contests')->where('id', $contestId)->update(['status' => 'completed']);
                    $data['message'] = 'Result declared! Prizes distributed to winners wallets.';
                }

                return response()->json($data);
            } catch (\Exception $e) {
                return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
            }
        });

        Route::post('api/phase4-orphan-fix/{sessionId}', function($sessionId) {
            try {
                $orphaned = \DB::table('contests')
                    ->where('league_session_id', $sessionId)
                    ->whereIn('status', ['live', 'upcoming'])
                    ->get();

                $fixed = 0;
                foreach ($orphaned as $contest) {
                    \DB::table('contests')->where('id', $contest->id)->update(['status' => 'completed']);
                    $fixed++;
                }

                return response()->json([
                    'success' => true,
                    'message' => "Phase 4 complete — {$fixed} orphaned contest(s) fixed",
                    'fixed_count' => $fixed
                ]);
            } catch (\Exception $e) {
                return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
            }
        });
        
        // Contest Analysis Routes
        Route::prefix('contest-analysis')->name('contest-analysis.')->group(function () {
            Route::get('/', [\App\Http\Controllers\Admin\ContestAnalysisController::class, 'index'])->name('index');
            Route::get('/session/{sessionId}', [\App\Http\Controllers\Admin\ContestAnalysisController::class, 'sessionDetail'])->name('session');
            Route::get('/contest/{contestId}', [\App\Http\Controllers\Admin\ContestAnalysisController::class, 'contestDetail'])->name('contest');
            Route::get('/users', [\App\Http\Controllers\Admin\ContestAnalysisController::class, 'usersList'])->name('users');
            Route::get('/user/{userId}', [\App\Http\Controllers\Admin\ContestAnalysisController::class, 'userDetail'])->name('user');
        });
        
        // Testing Routes
        Route::get('/testing', [\App\Http\Controllers\Admin\TestingController::class, 'index'])->name('testing.index');
        Route::get('/test-transactions', function() {
            return view('admin.test-transactions');
        })->name('test-transactions');
        Route::get('/testing/session/{sessionId}/contests', [\App\Http\Controllers\Admin\TestingController::class, 'sessionContests'])->name('testing.session-contests');
        Route::get('/testing/contest/{contestId}', [\App\Http\Controllers\Admin\TestingController::class, 'contestDetail'])->name('testing.contest-detail');
        Route::get('/testing/create-basket', [\App\Http\Controllers\Admin\TestingController::class, 'showCreateBasket'])->name('testing.create-basket');
        Route::get('/testing/test-users', [\App\Http\Controllers\Admin\TestingController::class, 'testUsers'])->name('testing.test-users');
        Route::post('/testing/generate-users', [\App\Http\Controllers\Admin\TestingController::class, 'generateTestUsers'])->name('testing.generate-users');
        Route::post('/testing/bulk-delete-users', [\App\Http\Controllers\Admin\TestingController::class, 'bulkDeleteTestUsers'])->name('testing.bulk-delete-users');
        Route::post('/testing/bulk-join-contest', [\App\Http\Controllers\Admin\TestingController::class, 'bulkJoinContest'])->name('testing.bulk-join-contest');
        Route::get('/testing/available-users', [\App\Http\Controllers\Admin\TestingController::class, 'getAvailableUsers'])->name('testing.available-users');
        Route::get('/testing/user/{userId}', [\App\Http\Controllers\Admin\TestingController::class, 'viewUser'])->name('testing.user-detail');
        Route::get('/testing/user/{userId}/session/{sessionId}/contests', [\App\Http\Controllers\Admin\TestingController::class, 'userSessionContests'])->name('testing.user-session-contests');
        Route::post('/testing/create-basket', [\App\Http\Controllers\Admin\TestingController::class, 'createBasket'])->name('testing.create-basket');
        Route::delete('/testing/delete-basket/{basketId}', [\App\Http\Controllers\Admin\TestingController::class, 'deleteBasket'])->name('testing.delete-basket');
        Route::get('/testing/baskets/{userId}/{sessionId}', [\App\Http\Controllers\Admin\TestingController::class, 'getBaskets'])->name('testing.get-baskets');
        Route::get('/testing/session/{sessionId}/contests', [\App\Http\Controllers\Admin\TestingController::class, 'sessionContests'])->name('testing.session-contests');
        Route::post('/testing/api', [\App\Http\Controllers\Admin\TestingController::class, 'testApi'])->name('testing.api');
    });
});


// Manual trigger to make session live and start contests
Route::get('admin/force-session-live/{sessionId}', function($sessionId) {
    try {
        $session = \App\Models\LeagueSession::find($sessionId);
        
        if (!$session) {
            return response()->json(['error' => 'Session not found'], 404);
        }
        
        // Make session live
        $session->update(['status' => 'live']);
        
        // Get all contests for this session
        $contests = \App\Models\Contest::where('league_session_id', $sessionId)
            ->where('status', 'upcoming')
            ->get();
        
        $updated = [];
        foreach ($contests as $contest) {
            $contest->update(['status' => 'live']);
            $updated[] = $contest->id;
            
            // Save starting prices
            $entries = \DB::table('contest_entries')
                ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
                ->where('contest_entries.contest_id', $contest->id)
                ->select('contest_entries.id', 'saved_baskets.assets')
                ->get();
            
            foreach ($entries as $entry) {
                $assets = json_decode($entry->assets, true) ?? [];
                $startingPrices = [];
                
                foreach ($assets as $asset) {
                    $symbol = $asset['symbol'] ?? $asset['name'];
                    $price = rand(1000, 5000); // Dummy price
                    $startingPrices[$symbol] = $price;
                }
                
                if (!empty($startingPrices)) {
                    \DB::table('contest_entries')
                        ->where('id', $entry->id)
                        ->update([
                            'starting_prices' => json_encode($startingPrices),
                            'contest_started_at' => now()
                        ]);
                }
            }
        }
        
        return response()->json([
            'success' => true,
            'session_id' => $sessionId,
            'session_status' => 'live',
            'contests_updated' => count($updated),
            'contest_ids' => $updated
        ]);
        
    } catch (\Exception $e) {
        return response()->json(['error' => $e->getMessage()], 500);
    }
})->name('admin.force-session-live');


// Test LG Pay Callback
Route::get('/test-lgpay-callback/{orderId}', function($orderId) {
    $payment = \DB::table('payments')->where('order_id', $orderId)->first();
    if (!$payment) return response()->json(['error' => 'Payment not found']);
    
    $params = ['order_sn' => $orderId, 'status' => 1, 'app_id' => 'YD4484'];
    ksort($params);
    $string = http_build_query($params);
    $string = urldecode($string) . '&key=2rQnx8NosOLyJAkCipz6ET2Ym70ME7';
    $params['sign'] = strtoupper(md5($string));
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, url('/payment/lgpay-callback'));
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $response = curl_exec($ch);
    curl_close($ch);
    
    $updatedPayment = \DB::table('payments')->where('order_id', $orderId)->first();
    $user = \DB::table('users')->where('id', $payment->user_id)->first();
    $transaction = \DB::table('transactions')->where('transaction_id', $orderId)->first();
    
    return response()->json([
        'test_params' => $params,
        'callback_response' => json_decode($response, true),
        'payment_before' => ['status' => $payment->payment_status, 'amount' => $payment->amount],
        'payment_after' => ['status' => $updatedPayment->payment_status, 'amount' => $updatedPayment->amount],
        'user_balance' => $user->deposit_balance ?? 0,
        'transaction_created' => $transaction ? 'Yes' : 'No'
    ], 200, [], JSON_PRETTY_PRINT);
});


// Debug Verify Payment
Route::get('/admin/payments/{id}/verify-debug', function($id) {
    $payment = \DB::table('payments')->where('id', $id)->first();
    
    if (!$payment) {
        return response()->json(['error' => 'Payment not found']);
    }

    $params = ['app_id' => 'YD4484', 'order_sn' => $payment->order_id];
    ksort($params);
    $signStr = 'app_id=' . $params['app_id'] . '&order_sn=' . $params['order_sn'] . '&key=2rQnx8NosOLyJAkCipz6ET2Ym70ME7';
    $params['sign'] = strtoupper(md5($signStr));
    
    $url = 'https://www.lg-pay.com/api/order/query?' . http_build_query($params);
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);
    
    return response()->json([
        'payment_id' => $payment->id,
        'order_id' => $payment->order_id,
        'request_url' => $url,
        'request_params' => $params,
        'http_code' => $httpCode,
        'curl_error' => $curlError,
        'raw_response' => $response,
        'decoded_response' => json_decode($response, true)
    ], 200, [], JSON_PRETTY_PRINT);
});


// Clear cache route
Route::get('/clear-cache', function() {
    \Artisan::call('cache:clear');
    \Artisan::call('config:clear');
    \Artisan::call('route:clear');
    \Artisan::call('view:clear');
    
    return response()->json([
        'success' => true,
        'message' => 'All caches cleared successfully'
    ]);
});

// Fixed Prize Distribution and Entry Fee Processing
Route::match(['GET', 'POST'], 'admin/api/fix-duplicate-transactions/{contestId}', function($contestId) {
    $transactionService = new \App\Services\TransactionService();
    $result = $transactionService->fixDuplicateTransactions($contestId);
    return response()->json($result);
});

// Debug Contest 757
Route::get('/debug-contest-757', function() {
    $contestId = 757;
    
    // Get contest details
    $contest = \DB::table('contests')
        ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
        ->select('contests.*', 'league_sessions.name as session_name', 'league_sessions.status as session_status', 'league_sessions.id as league_session_id')
        ->where('contests.id', $contestId)
        ->first();
    
    if (!$contest) {
        return response()->json(['error' => 'Contest not found'], 404);
    }
    
    // Check session asset prices
    $startPrices = \DB::table('session_asset_prices')
        ->where('league_session_id', $contest->league_session_id)
        ->whereNotNull('start_price')
        ->get();
        
    $endPrices = \DB::table('session_asset_prices')
        ->where('league_session_id', $contest->league_session_id)
        ->whereNotNull('end_price')
        ->get();
    
    // Check session assets
    $sessionAssets = \DB::table('league_session_assets')
        ->where('league_session_id', $contest->league_session_id)
        ->get();
    
    // Check contest entries
    $contestEntries = \DB::table('contest_entries')
        ->where('contest_id', $contestId)
        ->get();
    
    return response()->json([
        'contest' => $contest,
        'session_id' => $contest->league_session_id,
        'session_status' => $contest->session_status,
        'start_prices_count' => $startPrices->count(),
        'end_prices_count' => $endPrices->count(),
        'start_prices' => $startPrices,
        'end_prices' => $endPrices,
        'session_assets_count' => $sessionAssets->count(),
        'session_assets' => $sessionAssets,
        'contest_entries_count' => $contestEntries->count(),
        'contest_entries' => $contestEntries->take(3) // Show first 3 entries
    ], 200, [], JSON_PRETTY_PRINT);
});

// Fix Contest 757 Prices
Route::get('/fix-contest-757-prices', function() {
    $contestId = 757;
    
    $contest = \DB::table('contests')
        ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
        ->select('contests.*', 'league_sessions.id as league_session_id')
        ->where('contests.id', $contestId)
        ->first();
    
    if (!$contest) {
        return response()->json(['error' => 'Contest not found'], 404);
    }
    
    // Get session assets
    $sessionAssets = \DB::table('league_session_assets')
        ->where('league_session_id', $contest->league_session_id)
        ->pluck('asset_symbol');
    
    if ($sessionAssets->isEmpty()) {
        return response()->json(['error' => 'No session assets found'], 404);
    }
    
    $pricesSaved = 0;
    
    // Add dummy start and end prices
    foreach ($sessionAssets as $symbol) {
        $startPrice = rand(1000, 5000);
        $endPrice = $startPrice + rand(-500, 500); // Simulate price change
        
        \DB::table('session_asset_prices')->updateOrInsert(
            ['league_session_id' => $contest->league_session_id, 'asset_symbol' => $symbol],
            [
                'start_price' => $startPrice,
                'end_price' => $endPrice,
                'start_price_fetched_at' => now(),
                'end_price_fetched_at' => now(),
                'updated_at' => now(),
                'created_at' => now()
            ]
        );
        $pricesSaved++;
    }
    
    return response()->json([
        'success' => true,
        'message' => 'Dummy prices added for contest 757',
        'session_id' => $contest->league_session_id,
        'prices_saved' => $pricesSaved,
        'assets' => $sessionAssets
    ]);
});

// Get Session Prices API
Route::get('/api/session-prices/{sessionId}', function($sessionId) {
    try {
        // Get session info
        $session = \DB::table('league_sessions')->where('id', $sessionId)->first();
        
        if (!$session) {
            return response()->json(['success' => false, 'message' => 'Session not found'], 404);
        }
        
        // Get start prices
        $startPrices = \DB::table('session_asset_prices')
            ->where('league_session_id', $sessionId)
            ->whereNotNull('start_price')
            ->orderBy('asset_symbol')
            ->get();
        
        // Get end prices
        $endPrices = \DB::table('session_asset_prices')
            ->where('league_session_id', $sessionId)
            ->whereNotNull('end_price')
            ->orderBy('asset_symbol')
            ->get();
        
        return response()->json([
            'success' => true,
            'session_info' => $session,
            'start_prices' => $startPrices,
            'end_prices' => $endPrices,
            'start_count' => $startPrices->count(),
            'end_count' => $endPrices->count()
        ]);
        
    } catch (\Exception $e) {
        return response()->json([
            'success' => false,
            'message' => 'Error fetching session prices: ' . $e->getMessage()
        ], 500);
    }
});

// Manual Session Management Routes
Route::get('/admin/start-session/{sessionId}', function($sessionId) {
    try {
        $session = \DB::table('league_sessions')->where('id', $sessionId)->first();
        
        if (!$session) {
            return response()->json(['error' => 'Session not found'], 404);
        }
        
        // Update session to live
        \DB::table('league_sessions')->where('id', $sessionId)->update([
            'status' => 'live',
            'updated_at' => now()
        ]);
        
        // Update contests to live
        $contests = \DB::table('contests')->where('league_session_id', $sessionId)->get();
        \DB::table('contests')->where('league_session_id', $sessionId)->update([
            'status' => 'live',
            'updated_at' => now()
        ]);
        
        // Save starting prices for session assets
        $assets = \DB::table('league_session_assets')
            ->where('league_session_id', $sessionId)
            ->pluck('asset_symbol');
        
        $pricesSaved = 0;
        foreach ($assets as $symbol) {
            $price = rand(1000, 5000); // Dummy price for testing
            
            \DB::table('session_asset_prices')->updateOrInsert(
                ['league_session_id' => $sessionId, 'asset_symbol' => $symbol],
                [
                    'start_price' => $price,
                    'start_price_fetched_at' => now(),
                    'updated_at' => now(),
                    'created_at' => now()
                ]
            );
            $pricesSaved++;
        }
        
        return response()->json([
            'success' => true,
            'message' => 'Session started successfully',
            'session_id' => $sessionId,
            'contests_updated' => $contests->count(),
            'start_prices_saved' => $pricesSaved
        ]);
        
    } catch (\Exception $e) {
        return response()->json(['error' => $e->getMessage()], 500);
    }
});

Route::get('/admin/end-session/{sessionId}', function($sessionId) {
    try {
        $session = \DB::table('league_sessions')->where('id', $sessionId)->first();
        
        if (!$session) {
            return response()->json(['error' => 'Session not found'], 404);
        }
        
        // Update session to completed
        \DB::table('league_sessions')->where('id', $sessionId)->update([
            'status' => 'completed',
            'updated_at' => now()
        ]);
        
        // Update contests to completed
        $contests = \DB::table('contests')->where('league_session_id', $sessionId)->get();
        \DB::table('contests')->where('league_session_id', $sessionId)->update([
            'status' => 'completed',
            'updated_at' => now()
        ]);
        
        // Save ending prices for session assets
        $assets = \DB::table('league_session_assets')
            ->where('league_session_id', $sessionId)
            ->pluck('asset_symbol');
        
        $pricesSaved = 0;
        foreach ($assets as $symbol) {
            $price = rand(1000, 5000); // Dummy price for testing
            
            \DB::table('session_asset_prices')
                ->where('league_session_id', $sessionId)
                ->where('asset_symbol', $symbol)
                ->update([
                    'end_price' => $price,
                    'end_price_fetched_at' => now(),
                    'updated_at' => now()
                ]);
            $pricesSaved++;
        }
        
        return response()->json([
            'success' => true,
            'message' => 'Session ended successfully',
            'session_id' => $sessionId,
            'contests_updated' => $contests->count(),
            'end_prices_saved' => $pricesSaved
        ]);
        
    } catch (\Exception $e) {
        return response()->json(['error' => $e->getMessage()], 500);
    }
});
