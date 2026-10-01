<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\ApiController;
use App\Http\Controllers\Api\PricingController;
use App\Http\Controllers\Api\MarketController;
use App\Http\Controllers\Api\ContestController;
use App\Http\Controllers\Api\CalculateController;
use App\Http\Controllers\Api\SessionController;


use App\Http\Controllers\SavedBasketController;
use App\Http\Controllers\AssetController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\ReferralController;
use App\Http\Controllers\Admin\MarketTypeCategoryController;

// CORS headers moved to middleware - see app/Http/Middleware/Cors.php
Route::prefix('v1')->group(function () {
    require __DIR__ . '/app_api.php';
    
    // App Content Routes

});

Route::get('/user-contest-baskets', [ApiController::class, 'getUserContestBaskets']);

// Flexible Pricing API
Route::post('/flexible-pricing', [PricingController::class, 'flexiblePricing']);

// Payment Details Routes
Route::prefix('payment-details')->group(function () {
    Route::get('/{user_id}', [ApiController::class, 'getPaymentDetails']);
    Route::post('/update', [ApiController::class, 'updatePaymentDetails']);
});


// Live prices API
Route::get('/live-prices', [LivePriceController::class, 'getLivePrices']);

// Calculate routes
Route::post('/save-start-prices', [CalculateController::class, 'saveStartPrices']);
Route::post('/save-end-prices', [CalculateController::class, 'saveEndPrices']);
Route::post('/calculate-results', [CalculateController::class, 'calculateResults']);

// Payment routes
Route::post('/payment/notify', [PaymentController::class, 'notify']);
Route::post('/deposit-amount', [ApiController::class, 'depositAmount']);
Route::post('/add-winnings', [ApiController::class, 'addWinnings']);
Route::get('/payment/return', function() {
    return response()->json(['status' => 'success']);
});

 Route::get('live-contests-count', [\App\Http\Controllers\Admin\LiveManagementController::class, 'getLiveContestsCount'])->name('api.live-contests-count');
 Route::get('live-sessions-data', [\App\Http\Controllers\Admin\LiveManagementController::class, 'getLiveSessionsData'])->name('api.live-sessions-data');
// API routes

Route::get('/live-sessions', [SessionController::class, 'liveSessions']);
Route::get('/contests', [ContestController::class, 'contests']);

// Route::get('/contests/session/{sessionId}', [ApiController::class, 'contestsBySession']);
Route::get('/crypto/{symbols}', [ApiController::class, 'getCrypto']);
Route::get('/stock/{symbol}', [ApiController::class, 'getStock']);
// V1 App Routes

Route::post('/create-profile', [ApiController::class, 'createProfile']);
Route::post('/update-profile', [ApiController::class, 'updateProfile']);
Route::get('/user-profile', [ApiController::class, 'getUserProfile']);
Route::get('/wallet-amount', [ApiController::class, 'getWalletAmount']);
Route::post('/withdraw-amount', [ApiController::class, 'withdrawAmount']);
Route::get('/withdrawal-requests', [ApiController::class, 'getWithdrawalRequests']);
Route::get('/user-transactions', [ApiController::class, 'getUserTransactions']);
Route::get('/announcements', [ApiController::class, 'getAnnouncements']);
Route::get('/settings', [ApiController::class, 'getSettings']);
Route::get('/contest-rank-details/{id}', [ApiController::class, 'contestRankDetails']);
Route::get('/portfolio-entry-count', [ApiController::class, 'portfolioEntryCount']);
Route::post('/join-contest', [ApiController::class, 'joinContest']);

Route::post('/save-basket-and-join-contest', [ApiController::class, 'saveBasketAndJoinContest']);
Route::get('/featured-contests', [ApiController::class, 'featuredContests']);

Route::post('/bulk-save-baskets', [ApiController::class, 'bulkSaveBaskets']);
Route::post('/create-test-users', [ApiController::class, 'createTestUsers']);
Route::get('/all-users', [ApiController::class, 'getAllUsers']);
Route::get('/portfolios/contest/{contestId}', [ApiController::class, 'getPortfoliosByContest']);
Route::get('/ping', [ApiController::class, 'ping']);
Route::get('/test', [ApiController::class, 'testApi']);

// External API integrations
Route::get('/rapid-stocks', [App\Http\Controllers\PublicApiController::class, 'getRapidApiStocks']);
Route::get('/binance-crypto', [App\Http\Controllers\PublicApiController::class, 'getBinanceCrypto']);
Route::get('/sessions/{id}', [\App\Http\Controllers\Api\SessionController::class, 'getSession']);
Route::get('/prize-distributions', [ApiController::class, 'getPrizeDistributions']);
Route::get('/prize-distributions/{winnerCount}', [ApiController::class, 'getPrizeDistribution']);

// Save basket routes
// Route::post('/save-standalone-basket', [SavedBasketController::class, 'storeStandalone']);
// Route::delete('/saved-baskets/{id}', [SavedBasketController::class, 'destroy']);
// Route::post('/cleanup-empty-baskets', [SavedBasketController::class, 'cleanupEmptyBaskets']);
// Route::get('/saved-baskets', [ApiController::class, 'savedBaskets']);
// Route::post('/delete-basket', [ApiController::class, 'deleteBasket']);
// Route::post('/edit-basket', [ApiController::class, 'editBasket']);
// Route::post('/update-basket', [ApiController::class, 'editBasket']);
// Route::get('/saved-baskets-old', [SavedBasketController::class, 'index']);

// Asset routes
Route::post('/save-asset', [AssetController::class, 'store']);
Route::get('/assets', [AssetController::class, 'index']);

// Notification routes
Route::get('/notifications', [NotificationController::class, 'getUserNotifications']);
Route::post('/notifications/mark-read', [NotificationController::class, 'markAsRead']);
Route::post('/notifications/mark-all-read', [NotificationController::class, 'markAllAsRead']);

// Referral routes
Route::post('/process-deposit', [ReferralController::class, 'processDeposit']);
Route::get('/referral-data', [ReferralController::class, 'getReferralData']);
Route::get('/wallet-balance', [ReferralController::class, 'getWalletBalance']);

// FCM token route
Route::post('/save-fcm-token', [ApiController::class, 'saveFCMToken']);

// User sessions route
Route::get('/user-sessions', [ApiController::class, 'getUserSessions']);

Route::get('/contest-leaderboard/{contestId}', [ApiController::class, 'getContestLeaderboard']);
Route::get('/user-contest-assets/{contestId}', [ApiController::class, 'getUserContestAssets']);
Route::post('/update-session-status/{sessionId}', [ApiController::class, 'updateSessionStatus']);

// Missing session routes for Flutter app

// Cron job endpoints
Route::get('/cron/start-contests', [ApiController::class, 'cronAllInOne']);
Route::get('/cron/update-scores', [ApiController::class, 'cronUpdateScores']);
Route::get('/cron/end-contests', [ApiController::class, 'cronEndContests']);

// Test endpoint to check sessions
Route::get('/cron/test-sessions', function() {
    $now = now();
    $sessions = \DB::table('league_sessions')
        ->select('id', 'name', 'start_time', 'end_time', 'status')
        ->get();
    
    $sessionsToStart = \DB::table('league_sessions')
        ->where('start_time', '<=', $now)
        ->where('status', 'NOT_STARTED')
        ->get();
    
    return response()->json([
        'current_time' => $now->toDateTimeString(),
        'all_sessions' => $sessions,
        'sessions_to_start' => $sessionsToStart,
        'sessions_to_start_count' => $sessionsToStart->count()
    ]);
});

// Force start session endpoint
Route::get('/cron/force-start/{sessionId}', function($sessionId) {
    try {
        $session = \DB::table('league_sessions')->where('id', $sessionId)->first();
        if (!$session) {
            return response()->json(['error' => 'Session not found'], 404);
        }
        
        $calculateController = new \App\Http\Controllers\Api\CalculateController();
        $pricingController = new \App\Http\Controllers\Api\PricingController();
        $performanceController = new \App\Http\Controllers\Admin\PerformanceController();
        
        \DB::table('league_sessions')->where('id', $sessionId)->update(['status' => 'live']);
        
        $contests = \DB::table('contests')->where('league_session_id', $sessionId)->get();
        $results = [];
        
        foreach ($contests as $contest) {
            // Save start prices
            $startPriceResponse = $calculateController->saveStartPrices(new \Illuminate\Http\Request(['contest_id' => $contest->id]));
            $results['contest_' . $contest->id]['start_prices'] = json_decode($startPriceResponse->getContent(), true);
            
            // Generate and save prize structure
            $participants = \DB::table('contest_entries')->where('contest_id', $contest->id)->count();
            
            if ($participants > 0) {
                $prizeData = $pricingController->flexiblePricing(new \Illuminate\Http\Request([
                    'participants' => $participants,
                    'entry_fee' => $contest->entry_fee,
                    'platform_fee' => $contest->platform_fee,
                    'winning_percentage' => $contest->winning_percentage ?? 30,
                    'category' => $contest->category
                ]));
                
                $apiData = json_decode($prizeData->getContent(), true);
                $performanceController->saveApiStructure(new \Illuminate\Http\Request([
                    'contest_id' => $contest->id,
                    'participants' => $participants,
                    'api_data' => $apiData
                ]));
                
                $results['contest_' . $contest->id]['prize_structure'] = 'saved';
                $results['contest_' . $contest->id]['participants'] = $participants;
            }
        }
        
        return response()->json([
            'success' => true,
            'message' => "Session {$sessionId} started manually",
            'results' => $results
        ]);
    } catch (\Exception $e) {
        return response()->json([
            'success' => false,
            'error' => $e->getMessage(),
            'trace' => $e->getTraceAsString()
        ], 500);
    }
});

// Debug calculation endpoint
Route::get('/cron/debug-calc/{contestId}', function($contestId) {
    $startPrices = \DB::table('contest_start_prices')->where('contest_id', $contestId)->get();
    $endPrices = \DB::table('contest_end_prices')->where('contest_id', $contestId)->get();
    $entries = \DB::table('contest_entries')->where('contest_id', $contestId)->get();
    
    return response()->json([
        'contest_id' => $contestId,
        'start_prices_count' => $startPrices->count(),
        'end_prices_count' => $endPrices->count(),
        'entries_count' => $entries->count(),
        'start_prices' => $startPrices,
        'end_prices' => $endPrices,
        'entries' => $entries->map(function($e) {
            return [
                'user_id' => $e->user_id,
                'total_score' => $e->total_score,
                'rank' => $e->rank
            ];
        })
    ]);
});

// Debug interval check
Route::get('/cron/debug-interval/{contestId}', function($contestId) {
    $now = now();
    
    $startPriceTime = \DB::table('contest_start_prices')
        ->where('contest_id', $contestId)
        ->orderBy('timestamp', 'asc')
        ->value('timestamp');
        
    $lastEndPriceTime = \DB::table('contest_end_prices')
        ->where('contest_id', $contestId)
        ->orderBy('timestamp', 'desc')
        ->value('timestamp');
    
    $timeDiff = 0;
    $shouldUpdate = false;
    
    if (!$lastEndPriceTime && $startPriceTime) {
        $startTime = \Carbon\Carbon::parse($startPriceTime);
        $timeDiff = $now->diffInMinutes($startTime);
        if ($timeDiff >= 1) $shouldUpdate = true;
    } elseif ($lastEndPriceTime) {
        $endTime = \Carbon\Carbon::parse($lastEndPriceTime);
        $timeDiff = $now->diffInMinutes($endTime);
        if ($timeDiff >= 1) $shouldUpdate = true;
    }
    
    return response()->json([
        'contest_id' => $contestId,
        'current_time' => $now->toDateTimeString(),
        'start_price_time' => $startPriceTime,
        'last_end_price_time' => $lastEndPriceTime,
        'time_diff_minutes' => $timeDiff,
        'should_update' => $shouldUpdate,
        'interval_threshold' => 1
    ]);
});

// Single Master Cron Endpoint
Route::get('/cron/master/{secret}', function($secret) {
    if ($secret !== env('CRON_SECRET', 'your-secret-key-12345')) {
        return response()->json(['error' => 'Unauthorized'], 403);
    }
    
    $results = [];
    $now = now();
    \Log::info('Master cron started', ['time' => $now->toDateTimeString()]);
    
    $sessionController = new \App\Http\Controllers\Admin\LeagueSessionController();
    $calculateController = new \App\Http\Controllers\Api\CalculateController();
    $pricingController = new \App\Http\Controllers\Api\PricingController();
    $performanceController = new \App\Http\Controllers\Admin\PerformanceController();
    
    // PHASE 1: SESSION START
    $sessionsToStart = \DB::table('league_sessions')
        ->where('start_time', '<=', $now)
        ->where('status', 'upcoming')
        ->get();
    
    foreach ($sessionsToStart as $session) {
        try {
            \DB::table('league_sessions')->where('id', $session->id)->update(['status' => 'live']);
            
            $sessionObj = \App\Models\LeagueSession::find($session->id);
            $sessionController->saveSessionAssetStartPrices($sessionObj);
            
            $contests = \DB::table('contests')
                ->where('league_session_id', $session->id)
                ->where('status', '!=', 'cancelled')
                ->get();
            
            foreach ($contests as $contest) {
                \DB::table('contests')->where('id', $contest->id)->update(['status' => 'live']);
                
                $participants = \DB::table('contest_entries')->where('contest_id', $contest->id)->count();
                
                if ($participants > 0) {
                    $prizeData = $pricingController->flexiblePricing(new \Illuminate\Http\Request([
                        'participants' => $participants,
                        'entry_fee' => $contest->entry_fee,
                        'platform_fee' => $contest->platform_fee,
                        'winning_percentage' => $contest->winning_percentage ?? 30,
                        'category' => $contest->category
                    ]));
                    
                    $apiData = json_decode($prizeData->getContent(), true);
                    $performanceController->saveApiStructure(new \Illuminate\Http\Request([
                        'contest_id' => $contest->id,
                        'participants' => $participants,
                        'api_data' => $apiData
                    ]));
                }
            }
            
            $results['phase1'][] = "Session {$session->id} started";
        } catch (\Exception $e) {
            \Log::error("Session {$session->id} start failed", ['error' => $e->getMessage()]);
            $results['phase1'][] = "Session {$session->id} failed: {$e->getMessage()}";
        }
    }
    
    // PHASE 2: LIVE SESSION PRICE UPDATES (Every 1 minute)
    $liveSessions = \DB::table('league_sessions')->where('status', 'live')->get();
    
    foreach ($liveSessions as $session) {
        try {
            // Check if end prices exist
            $lastEndPrice = \DB::table('session_asset_prices')
                ->where('league_session_id', $session->id)
                ->whereNotNull('end_price')
                ->orderBy('end_price_fetched_at', 'desc')
                ->first();
            
            $shouldUpdate = false;
            
            if (!$lastEndPrice) {
                // No end prices yet, check if 5 minutes passed since start
                $startPrice = \DB::table('session_asset_prices')
                    ->where('league_session_id', $session->id)
                    ->whereNotNull('start_price')
                    ->first();
                
                if ($startPrice) {
                    $timeDiff = \Carbon\Carbon::parse($startPrice->start_price_fetched_at)->diffInMinutes($now);
                    if ($timeDiff >= 5) {
                        $shouldUpdate = true;
                    }
                }
            } else {
                // End prices exist, check if 5 minutes passed since last update
                $timeDiff = \Carbon\Carbon::parse($lastEndPrice->end_price_fetched_at)->diffInMinutes($now);
                if ($timeDiff >= 5) {
                    $shouldUpdate = true;
                }
            }
            
            if ($shouldUpdate) {
                // Update end prices
                $sessionObj = \App\Models\LeagueSession::find($session->id);
                $sessionController->saveSessionAssetEndPrices($sessionObj);
                
                // Calculate results for all contests (NO wallet distribution)
                $contests = \DB::table('contests')
                    ->where('league_session_id', $session->id)
                    ->where('status', '!=', 'cancelled')
                    ->get();
                foreach ($contests as $contest) {
                    $calculateController->calculateResults(new \Illuminate\Http\Request([
                        'contest_id' => $contest->id,
                        'credit_wallet' => false
                    ]));
                }
                
                $results['phase2'][] = "Session {$session->id} prices updated (no distribution)";
            }
        } catch (\Exception $e) {
            \Log::error("Session {$session->id} update failed", ['error' => $e->getMessage()]);
            $results['phase2'][] = "Session {$session->id} failed: {$e->getMessage()}";
        }
    }
    
    // PHASE 3: SESSION COMPLETION (Final calculation + wallet distribution)
    $sessionsToEnd = \DB::table('league_sessions')
        ->where('end_time', '<=', $now)
        ->where('status', 'live')
        ->get();
    
    foreach ($sessionsToEnd as $session) {
        try {
            // Final end price update
            $sessionObj = \App\Models\LeagueSession::find($session->id);
            $sessionController->saveSessionAssetEndPrices($sessionObj);
            
            // Final calculation WITH wallet distribution
            $contests = \DB::table('contests')
                ->where('league_session_id', $session->id)
                ->where('status', '!=', 'cancelled')
                ->get();
            foreach ($contests as $contest) {
                $calculateController->calculateResults(new \Illuminate\Http\Request([
                    'contest_id' => $contest->id,
                    'credit_wallet' => true
                ]));
                
                // Update contest status to completed
                \DB::table('contests')->where('id', $contest->id)->update(['status' => 'completed']);
            }
            
            // Mark session as completed
            \DB::table('league_sessions')->where('id', $session->id)->update(['status' => 'completed']);
            
            $results['phase3'][] = "Session {$session->id} completed with distribution";
        } catch (\Exception $e) {
            \Log::error("Session {$session->id} completion failed", ['error' => $e->getMessage()]);
            $results['phase3'][] = "Session {$session->id} failed: {$e->getMessage()}";
        }
    }
    
    // PHASE 4: UPDATE ORPHANED CONTESTS (contests in live status but session is completed)
    $orphanedContests = \DB::table('contests')
        ->join('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
        ->where('league_sessions.status', 'completed')
        ->where('contests.status', 'live')
        ->where('contests.status', '!=', 'cancelled')
        ->select('contests.id', 'contests.league_session_id')
        ->get();
    
    foreach ($orphanedContests as $contest) {
        try {
            \DB::table('contests')->where('id', $contest->id)->update(['status' => 'completed']);
            $results['phase4'][] = "Orphaned contest {$contest->id} marked as completed";
        } catch (\Exception $e) {
            \Log::error("Orphaned contest {$contest->id} update failed", ['error' => $e->getMessage()]);
            $results['phase4'][] = "Contest {$contest->id} failed: {$e->getMessage()}";
        }
    }
    
    \Log::info('Master cron completed', ['results' => $results]);
    
    return response()->json([
        'success' => true,
        'time' => $now->toDateTimeString(),
        'results' => $results
    ]);
});

// Delete basket
Route::delete('/admin/testing/delete-basket/{basketId}', function($basketId) {
    try {
        \DB::table('saved_baskets')->where('id', $basketId)->delete();
        return response()->json(['success' => true]);
    } catch (\Exception $e) {
        return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
    }
});

// Get baskets for user and session
Route::get('/admin/testing/baskets/{userId}/{sessionId}', function($userId, $sessionId) {
    try {
        $baskets = \DB::table('saved_baskets')
            ->where('user_id', $userId)
            ->where('session_id', $sessionId)
            ->orderBy('created_at', 'desc')
            ->get();
            
        return response()->json($baskets);
        
    } catch (\Exception $e) {
        return response()->json([
            'success' => false,
            'message' => $e->getMessage()
        ], 500);
    }
});

// Get contests for session dropdown
Route::get('/session-contests/{sessionId}', function($sessionId) {
    try {
        $contests = \DB::table('contests')
            ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
            ->where('league_sessions.id', $sessionId)
            ->select('contests.id', 'contests.category', 'contests.entry_fee', 'contests.participants', 'contests.created_at')
            ->orderBy('contests.id')
            ->get();
            
        return response()->json([
            'success' => true,
            'contests' => $contests
        ]);
        
    } catch (\Exception $e) {
        return response()->json([
            'success' => false,
            'message' => $e->getMessage()
        ], 500);
    }
});

// Get assets by session for basket creation
Route::get('/session-assets/{sessionId}', function($sessionId) {
    try {
        $assetsByCategory = \DB::table('league_session_assets')
            ->leftJoin('market_type_categories', 'league_session_assets.category_id', '=', 'market_type_categories.id')
            ->leftJoin('assets', 'league_session_assets.asset_symbol', '=', 'assets.symbol')
            ->where('league_session_assets.league_session_id', $sessionId)
            ->select(
                'league_session_assets.asset_symbol',
                'assets.name as asset_name',
                'market_type_categories.name as category_name',
                'market_type_categories.id as category_id'
            )
            ->orderBy('market_type_categories.name')
            ->orderBy('league_session_assets.asset_symbol')
            ->get()
            ->groupBy('category_name');
            
        $formattedAssets = [];
        
        foreach ($assetsByCategory as $categoryName => $categoryAssets) {
            if (!$categoryName) continue;
            
            $country = '💰 Crypto';
            $capSize = 'Unknown';
            
            if (str_contains($categoryName, 'Indian')) $country = '🇮🇳 Indian';
            elseif (str_contains($categoryName, 'US')) $country = '🇺🇸 US';
            elseif (str_contains($categoryName, 'UK')) $country = '🇬🇧 UK';
            elseif (str_contains($categoryName, 'Crypto')) $country = '💰 Crypto';
            
            if (str_contains($categoryName, 'Small')) $capSize = 'Small Cap';
            elseif (str_contains($categoryName, 'Mid')) $capSize = 'Mid Cap';
            elseif (str_contains($categoryName, 'Large')) $capSize = 'Large Cap';
            
            $assets = [];
            foreach ($categoryAssets->unique('asset_symbol') as $asset) {
                $assets[] = [
                    'symbol' => $asset->asset_symbol,
                    'name' => $asset->asset_name ?: 'Asset Name',
                    'image' => "https://financialmodelingprep.com/image-stock/{$asset->asset_symbol}.png"
                ];
            }
            
            $formattedAssets[] = [
                'category_name' => $categoryName,
                'display_name' => $capSize !== 'Unknown' ? $capSize : $categoryName,
                'country' => $country,
                'cap_size' => $capSize,
                'count' => count($assets),
                'assets' => $assets
            ];
        }
        
        // If no assets found, return default categories
        if (empty($formattedAssets)) {
            $formattedAssets = [
                [
                    'category_name' => 'Large Cap Crypto',
                    'display_name' => 'Large Cap',
                    'country' => '💰 Crypto',
                    'cap_size' => 'Large Cap',
                    'count' => 1,
                    'assets' => [
                        ['symbol' => 'BTC-USD', 'name' => 'Bitcoin', 'image' => 'https://financialmodelingprep.com/image-stock/BTC-USD.png']
                    ]
                ],
                [
                    'category_name' => 'Mid Cap Crypto',
                    'display_name' => 'Mid Cap',
                    'country' => '💰 Crypto',
                    'cap_size' => 'Mid Cap',
                    'count' => 1,
                    'assets' => [
                        ['symbol' => 'ETH-USD', 'name' => 'Ethereum', 'image' => 'https://financialmodelingprep.com/image-stock/ETH-USD.png']
                    ]
                ]
            ];
        }
        
        return response()->json([
            'success' => true,
            'categories' => $formattedAssets
        ]);
        
    } catch (\Exception $e) {
        return response()->json([
            'success' => false,
            'message' => $e->getMessage()
        ], 500);
    }
});

// Assign basket to contest
Route::post('/assign-basket-to-contest', function(\Illuminate\Http\Request $request) {
    try {
        $basketId = $request->input('basket_id');
        $contestId = $request->input('contest_id');
        
        if (!$basketId || !$contestId) {
            return response()->json([
                'success' => false,
                'message' => 'Basket ID and Contest ID are required'
            ], 400);
        }
        
        // Check if basket exists
        $basket = \DB::table('saved_baskets')->where('id', $basketId)->first();
        if (!$basket) {
            return response()->json([
                'success' => false,
                'message' => 'Basket not found'
            ], 404);
        }
        
        // Check if contest exists
        $contest = \DB::table('contests')->where('id', $contestId)->first();
        if (!$contest) {
            return response()->json([
                'success' => false,
                'message' => 'Contest not found'
            ], 404);
        }
        
        // Update basket to assign to contest
        \DB::table('saved_baskets')
            ->where('id', $basketId)
            ->update([
                'contest_id' => $contestId,
                'is_standalone' => 0,
                'updated_at' => now()
            ]);
        
        return response()->json([
            'success' => true,
            'message' => 'Basket assigned to contest successfully'
        ]);
        
    } catch (\Exception $e) {
        return response()->json([
            'success' => false,
            'message' => $e->getMessage()
        ], 500);
    }
});

// Add sample prices
Route::get('/api/add-sample-prices/{contestId}', [MarketController::class, 'addSamplePrices']);

// Save basket with selected assets
Route::post('/save-basket', function(\Illuminate\Http\Request $request) {
    try {
        $userId = $request->input('user_id', 1);
        $sessionId = $request->input('session_id');
        $contestId = $request->input('contest_id');
        $selectedAssets = $request->input('assets', []);
        $multipliers = $request->input('multipliers', []);
        $isStandalone = $request->boolean('is_standalone', false);
        
        if (empty($selectedAssets)) {
            return response()->json([
                'success' => false,
                'message' => 'Please select at least one asset'
            ], 400);
        }
        
        $basketId = \DB::table('saved_baskets')->insertGetId([
            'user_id' => $userId,
            'session_id' => $sessionId,
            'contest_id' => $contestId,
            'assets' => json_encode($selectedAssets),
            'multipliers' => json_encode($multipliers),
            'total_score' => 0,
            'is_standalone' => $isStandalone ? 1 : 0,
            'created_at' => now(),
            'updated_at' => now()
        ]);
        
        return response()->json([
            'success' => true,
            'message' => 'Basket saved successfully',
            'basket_id' => $basketId
        ]);
        
    } catch (\Exception $e) {
        return response()->json([
            'success' => false,
            'message' => $e->getMessage()
        ], 500);
    }
});


// Debug equal contest prize structure
Route::get('/debug/equal-prize/{contestId}', function($contestId) {
    try {
        $contest = \DB::table('contests')->where('id', $contestId)->first();
        if (!$contest) {
            return response()->json(['error' => 'Contest not found'], 404);
        }
        
        $participants = \DB::table('contest_entries')->where('contest_id', $contestId)->count();
        
        $pricingController = new \App\Http\Controllers\Api\PricingController();
        $prizeData = $pricingController->flexiblePricing(new \Illuminate\Http\Request([
            'participants' => $participants,
            'entry_fee' => $contest->entry_fee,
            'platform_fee' => $contest->platform_fee,
            'winning_percentage' => $contest->winning_percentage ?? 30,
            'category' => $contest->category
        ]));
        
        $apiData = json_decode($prizeData->getContent(), true);
        
        // Try to save
        $performanceController = new \App\Http\Controllers\Admin\PerformanceController();
        $saveResponse = $performanceController->saveApiStructure(new \Illuminate\Http\Request([
            'contest_id' => $contestId,
            'participants' => $participants,
            'api_data' => $apiData
        ]));
        
        $saved = json_decode($saveResponse->getContent(), true);
        
        // Check what was saved
        $savedPrizes = \DB::table('contest_performance_prizes')
            ->where('contest_id', $contestId)
            ->get();
        
        return response()->json([
            'contest' => $contest,
            'participants' => $participants,
            'api_data' => $apiData,
            'save_response' => $saved,
            'saved_prizes' => $savedPrizes
        ]);
    } catch (\Exception $e) {
        return response()->json([
            'error' => $e->getMessage(),
            'trace' => $e->getTraceAsString()
        ], 500);
    }
});
