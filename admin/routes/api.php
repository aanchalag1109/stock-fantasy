<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
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




Route::match(['GET', 'POST'], 'fix-duplicate-transactions/{contestId}', function($contestId) {
    $transactionService = new \App\Services\TransactionService();
    $result = $transactionService->fixDuplicateTransactions($contestId);
    return response()->json($result);
});

Route::match(['GET', 'POST'], 'delete-failed-transactions/{contestId}', function($contestId) {
    // Delete all failed transactions for this contest
    $deleted = DB::table('transactions')
        ->where('transaction_id', 'LIKE', "CONTEST_{$contestId}_%")
        ->where('type', 'winnings')
        ->where('status', 'failed')
        ->delete();
    
    return response()->json([
        'success' => true,
        'message' => 'Failed transactions deleted completely',
        'deleted_count' => $deleted,
        'contest_id' => $contestId
    ]);
});

Route::get('debug-transactions/{contestId}', function($contestId) {
    $transactions = DB::table('transactions')
        ->where('transaction_id', 'LIKE', "CONTEST_{$contestId}_%")
        ->get();
    
    return response()->json([
        'contest_id' => $contestId,
        'transactions' => $transactions,
        'columns' => Schema::getColumnListing('transactions')
    ]);
});

Route::post('distribute-prizes/{contestId}', function($contestId) {
    $transactionService = new \App\Services\TransactionService();
    $result = $transactionService->distributePrizes($contestId);
    return response()->json($result);
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

// ─── LIGHTWEIGHT STATUS CRON (fast, no API calls) ─────────────────────────
// Ye sirf session status update karta hai — har 1 min chala sakte ho
Route::get('/cron/status-update', function() {
    $secret = request()->header('X-Cron-Secret') ?? request()->query('secret');
    if ($secret !== env('CRON_SECRET', 'probtrade-cron-secret-2026')) {
        return response()->json(['error' => 'Unauthorized'], 403);
    }

    $now = now('Asia/Kolkata');
    $results = [];

    // upcoming → live (start_time passed)
    $startedSessions = \DB::table('league_sessions')
        ->where('start_time', '<=', $now)
        ->where('status', 'upcoming')
        ->get();

    foreach ($startedSessions as $session) {
        \DB::table('league_sessions')
            ->where('id', $session->id)
            ->where('status', 'upcoming')
            ->update(['status' => 'live']);

        \DB::table('contests')
            ->where('league_session_id', $session->id)
            ->whereNotIn('status', ['cancelled', 'completed'])
            ->update(['status' => 'live']);

        $results[] = "Session #{$session->id} → LIVE";
    }

    // live → completed (end_time passed)
    $endedSessions = \DB::table('league_sessions')
        ->where('end_time', '<=', $now)
        ->where('status', 'live')
        ->get();

    foreach ($endedSessions as $session) {
        \DB::table('league_sessions')
            ->where('id', $session->id)
            ->where('status', 'live')
            ->update(['status' => 'completed']);

        \DB::table('contests')
            ->where('league_session_id', $session->id)
            ->whereNotIn('status', ['cancelled', 'completed'])
            ->update(['status' => 'completed']);

        $results[] = "Session #{$session->id} → COMPLETED";
    }

    // Bot auto-join
    $botResults = \App\Services\BotAutoJoinService::processAutoJoin();
    if (!empty($botResults)) {
        $results = array_merge($results, $botResults);
    }

    \Illuminate\Support\Facades\Cache::put('cron_last_run', $now);

    return response()->json([
        'success' => true,
        'time' => $now->toDateTimeString(),
        'results' => $results
    ]);
});

// Single Master Cron Endpoint
// FIX 1: Secret header se lo, URL se nahi (security)
Route::get('/cron/master', function() {
    $secret = request()->header('X-Cron-Secret') ?? request()->query('secret');
    if ($secret !== env('CRON_SECRET', 'probtrade-cron-secret-2026')) {
        return response()->json(['error' => 'Unauthorized'], 403);
    }

    // FIX 2: IST timezone use karo
    $now = now('Asia/Kolkata');
    $results = [];
    \Log::info('Master cron started', ['time' => $now->toDateTimeString()]);

    $sessionController = new \App\Http\Controllers\Admin\LeagueSessionController();
    $calculateController = new \App\Http\Controllers\Api\CalculateController();
    $pricingController  = new \App\Http\Controllers\Api\PricingController();
    $performanceController = new \App\Http\Controllers\Admin\PerformanceController();

    // ─── PHASE 0: PRE-FETCH PRICES (5 MIN BEFORE START) ───────────────────
    $nearFuture = $now->copy()->addMinutes(5);
    $sessionsAboutToStart = \DB::table('league_sessions')
        ->where('start_time', '<=', $nearFuture)
        ->where('start_time', '>', $now)
        ->where('status', 'upcoming')
        ->get();

    foreach ($sessionsAboutToStart as $session) {
        try {
            $sessionObj = \App\Models\LeagueSession::find($session->id);
            $sessionController->saveSessionAssetStartPrices($sessionObj);
            $results['phase0'][] = "✅ Pre-fetched prices for Session #{$session->id} ({$sessionObj->name})";
        } catch (\Exception $e) {
            \Log::error("Phase 0 pre-fetch failed for session {$session->id}: " . $e->getMessage());
        }
    }

    // ─── PHASE 1: SESSION START ───────────────────────────────────────────────
    $sessionsToStart = \DB::table('league_sessions')
        ->where('start_time', '<=', $now)
        ->where('status', 'upcoming')
        ->get();

    foreach ($sessionsToStart as $session) {
        try {
            // Atomic update — sirf 'upcoming' wali session hi live hogi
            $updated = \DB::table('league_sessions')
                ->where('id', $session->id)
                ->where('status', 'upcoming')
                ->update(['status' => 'live']);

            if (!$updated) {
                $results['phase1'][] = "Session {$session->id} skipped (already updated)";
                continue;
            }

            $sessionObj = \App\Models\LeagueSession::find($session->id);
            $sessionController->saveSessionAssetStartPrices($sessionObj);

            $contests = \DB::table('contests')
                ->where('league_session_id', $session->id)
                ->whereNotIn('status', ['cancelled', 'live', 'completed'])
                ->get();

            foreach ($contests as $contest) {
                \DB::table('contests')->where('id', $contest->id)->update(['status' => 'live']);

                // Fixed contests (guaranteed/practice) — prize structure already set, don't recalculate
                $isFixed = !empty($contest->is_fixed_prize) || in_array($contest->category, ['guaranteed', 'practice']);

                if ($isFixed) {
                    // Sirf prize_distribution se contest_performance_prizes mein save karo (agar nahi hai to)
                    $existingPrizes = \DB::table('contest_performance_prizes')->where('contest_id', $contest->id)->count();
                    if ($existingPrizes === 0 && !empty($contest->prize_distribution)) {
                        $dist = json_decode($contest->prize_distribution, true);
                        if (is_array($dist)) {
                            foreach ($dist as $row) {
                                \DB::table('contest_performance_prizes')->insert([
                                    'contest_id'       => $contest->id,
                                    'rank_label'       => $row['label'] ?? ('Rank ' . ($row['rank_start'] ?? 1)),
                                    'rank_start'       => intval($row['rank_start'] ?? 1),
                                    'rank_end'         => intval($row['rank_end'] ?? 1),
                                    'winners_count'    => intval($row['winners'] ?? 1),
                                    'percentage'       => floatval($row['percent'] ?? 0),
                                    'prize_amount'     => floatval($row['prize'] ?? 0),
                                    'per_winner_amount'=> floatval($row['per_winner'] ?? $row['perWinner'] ?? 0),
                                    'prize_pool'       => floatval($contest->prize_pool ?? 0),
                                    'total_participants'=> \DB::table('contest_entries')->where('contest_id', $contest->id)->count(),
                                    'created_at'       => now(),
                                    'updated_at'       => now(),
                                ]);
                            }
                        }
                    }
                    $results['phase1'][] = "🔒 Fixed contest #{$contest->id} ({$contest->category}) — prize structure frozen";
                    continue; // Skip dynamic prize calculation
                }

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
                }
            }

            $results['phase1'][] = "🚀 Session #{$session->id} ({$sessionObj->name}) started. " . $contests->count() . " contests are now LIVE.";
        } catch (\Exception $e) {
            \Log::error("Session {$session->id} start failed", ['error' => $e->getMessage()]);
            $results['phase1'][] = "Session {$session->id} failed: {$e->getMessage()}";
        }
    }

    // ─── PHASE 2: LIVE SCORE UPDATES (har 5 min, no wallet) ──────────────────
    // FIX 3: Phase 3 mein jaane wali sessions yahan skip karo (race condition)
    $sessionsEndingSoon = \DB::table('league_sessions')
        ->where('end_time', '<=', $now)
        ->where('status', 'live')
        ->pluck('id')
        ->toArray();

    $liveSessions = \DB::table('league_sessions')
        ->where('status', 'live')
        ->whereNotIn('id', $sessionsEndingSoon)
        ->get();

    foreach ($liveSessions as $session) {
        try {
            // FIX 4: null safe — start_price_fetched_at null ho sakta hai
            $lastEndPrice = \DB::table('session_asset_prices')
                ->where('league_session_id', $session->id)
                ->whereNotNull('end_price')
                ->whereNotNull('end_price_fetched_at')
                ->orderBy('end_price_fetched_at', 'desc')
                ->first();

            $shouldUpdate = false;

            if (!$lastEndPrice) {
                $startPrice = \DB::table('session_asset_prices')
                    ->where('league_session_id', $session->id)
                    ->whereNotNull('start_price')
                    ->whereNotNull('start_price_fetched_at')
                    ->first();

                if ($startPrice && $startPrice->start_price_fetched_at) {
                    $timeDiff = \Carbon\Carbon::parse($startPrice->start_price_fetched_at)
                        ->diffInMinutes($now);
                    if ($timeDiff >= 5) $shouldUpdate = true;
                }
            } else {
                $timeDiff = \Carbon\Carbon::parse($lastEndPrice->end_price_fetched_at)
                    ->diffInMinutes($now);
                if ($timeDiff >= 5) $shouldUpdate = true;
            }

            if ($shouldUpdate) {
                $sessionObj = \App\Models\LeagueSession::find($session->id);
                $sessionController->saveSessionAssetEndPrices($sessionObj);

                $contests = \DB::table('contests')
                    ->where('league_session_id', $session->id)
                    ->whereNotIn('status', ['cancelled', 'completed'])
                    ->get();

                foreach ($contests as $contest) {
                    $calculateController->calculateResults(new \Illuminate\Http\Request([
                        'contest_id'    => $contest->id,
                        'credit_wallet' => false
                    ]));
                }
                $results['phase2'][] = "📊 Session #{$session->id} scores updated for " . $contests->count() . " active contests.";
            } else {
                $results['phase2'][] = "Session {$session->id} skipped (not 5 min yet)";
            }
        } catch (\Exception $e) {
            \Log::error("Session {$session->id} score update failed", ['error' => $e->getMessage()]);
            $results['phase2'][] = "Session {$session->id} failed: {$e->getMessage()}";
        }
    }

    // ─── PHASE 3: SESSION COMPLETE + PRIZE DISTRIBUTION ──────────────────────
    foreach ($sessionsEndingSoon as $sessionId) {
        try {
            // Atomic: live → completing (race condition safe)
            $locked = \DB::table('league_sessions')
                ->where('id', $sessionId)
                ->where('status', 'live')
                ->update(['status' => 'completing']);

            if (!$locked) {
                $results['phase3'][] = "⏭ Session {$sessionId} skipped (already completing/completed)";
                continue;
            }

            // Fetch final end prices
            $sessionObj = \App\Models\LeagueSession::find($sessionId);
            $sessionController->saveSessionAssetEndPrices($sessionObj);

            $contests = \DB::table('contests')
                ->where('league_session_id', $sessionId)
                ->whereNotIn('status', ['cancelled', 'completed'])
                ->get();

            foreach ($contests as $contest) {
                // Calculate scores ONLY (no wallet credit) — prizes will be distributed manually from admin panel
                $calculateController->calculateResults(new \Illuminate\Http\Request([
                    'contest_id'    => $contest->id,
                    'credit_wallet' => false,
                ]));

                // For DYNAMIC contests: recalculate prize structure based on actual joined users
                $isFixed = !empty($contest->is_fixed_prize) || in_array($contest->category, ['guaranteed', 'practice']);
                if (!$isFixed) {
                    $actualParticipants = \DB::table('contest_entries')->where('contest_id', $contest->id)->count();
                    if ($actualParticipants > 0) {
                        $prizeData = $pricingController->flexiblePricing(new \Illuminate\Http\Request([
                            'participants'       => $actualParticipants,
                            'entry_fee'          => $contest->entry_fee,
                            'platform_fee'       => $contest->platform_fee,
                            'winning_percentage' => $contest->winning_percentage ?? 30,
                            'category'           => $contest->category,
                        ]));
                        $apiData = json_decode($prizeData->getContent(), true);
                        // Delete old prizes and save new ones based on actual participants
                        \DB::table('contest_performance_prizes')->where('contest_id', $contest->id)->delete();
                        $performanceController->saveApiStructure(new \Illuminate\Http\Request([
                            'contest_id'   => $contest->id,
                            'participants' => $actualParticipants,
                            'api_data'     => $apiData,
                        ]));
                    }
                }

                \DB::table('contests')->where('id', $contest->id)->update(['status' => 'completed']);
            }

            \DB::table('league_sessions')->where('id', $sessionId)->update(['status' => 'completed']);
            $results['phase3'][] = "✅ Session #{$sessionId} completed. " . $contests->count() . " contests processed + prizes credited.";

        } catch (\Exception $e) {
            // Rollback completing → live so next cron can retry
            \DB::table('league_sessions')
                ->where('id', $sessionId)
                ->where('status', 'completing')
                ->update(['status' => 'live']);
            \Log::error("Phase3 Session {$sessionId} failed", ['error' => $e->getMessage()]);
            $results['phase3'][] = "❌ Session {$sessionId} failed: {$e->getMessage()}";
        }
    }

    // ─── PHASE 4: ORPHANED CONTESTS FIX ──────────────────────────────────────
    $orphanedContests = \DB::table('contests')
        ->join('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
        ->where('league_sessions.status', 'completed')
        ->whereIn('contests.status', ['live', 'upcoming'])
        ->select('contests.id')
        ->get();

    foreach ($orphanedContests as $contest) {
        try {
            \DB::table('contests')->where('id', $contest->id)->update(['status' => 'completed']);
            $results['phase4'][] = "🔧 Orphaned contest #{$contest->id} fixed";
        } catch (\Exception $e) {
            \Log::error("Orphaned contest {$contest->id} fix failed", ['error' => $e->getMessage()]);
        }
    }

    // ─── PHASE 5: BOT AUTO-JOIN ───────────────────────────────────────────────
    // Sessions jo X minutes mein start hongi, unke contests mein bots join karein
    $botResults = \App\Services\BotAutoJoinService::processAutoJoin();
    if (!empty($botResults)) {
        $results['phase5'] = $botResults;
    }

    \Log::info('Master cron completed', ['results' => $results]);

    // Track in DB
    \App\Models\CronLog::create([
        'run_time' => $now,
        'status' => 'success',
        'output' => json_encode($results),
        'type' => 'master'
    ]);
    \Illuminate\Support\Facades\Cache::put('cron_last_run', $now);

    return response()->json([
        'success' => true,
        'time'    => $now->toDateTimeString(),
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

Route::post('/admin/api/distribute-prizes-fixed/{contestId}', function($contestId) {
    $prizeService = new \App\Services\PrizeDistributionService();
    $result = $prizeService->distributePrizes($contestId);
    return response()->json($result);
});

Route::post('/admin/api/fix-entry-fees/{contestId}', function($contestId) {
    $entryFeeService = new \App\Services\EntryFeeService();
    $result = $entryFeeService->fixWrongEntryFees($contestId);
    return response()->json($result);
});

// Improved Price Management
Route::post('/admin/api/fetch-prices-robust/{sessionId}', function($sessionId) {
    $priceService = new \App\Services\ImprovedSessionPriceService(
        new \App\Services\RobustPriceFetchingService()
    );
    $result = $priceService->saveSessionStartPrices($sessionId);
    return response()->json($result);
});

Route::post('/admin/api/validate-session-prices/{sessionId}', function($sessionId) {
    $validationService = new \App\Services\PriceValidationService(
        new \App\Services\RobustPriceFetchingService()
    );
    $result = $validationService->validateSessionPrices($sessionId);
    return response()->json($result);
});

Route::post('/admin/api/auto-correct-prices/{sessionId}', function($sessionId) {
    $validationService = new \App\Services\PriceValidationService(
        new \App\Services\RobustPriceFetchingService()
    );
    $dryRun = request()->get('dry_run', true);
    $result = $validationService->autoCorrectSuspiciousPrices($sessionId, 3.0, $dryRun);
    return response()->json($result);
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


// Historical price verification endpoint
Route::post('/admin/api/verify-historical-prices/{sessionId}', [\App\Http\Controllers\Admin\PriceAnalysisController::class, 'verifyHistoricalPrices']);

// Session prices endpoint for historical price display
Route::get('/session-prices/{sessionId}', function($sessionId) {
    try {
        $startPrices = \DB::table('session_asset_prices')
            ->where('league_session_id', $sessionId)
            ->whereNotNull('start_price')
            ->select('asset_symbol', 'start_price', 'start_price_fetched_at')
            ->get();
            
        $endPrices = \DB::table('session_asset_prices')
            ->where('league_session_id', $sessionId)
            ->whereNotNull('end_price')
            ->select('asset_symbol', 'end_price', 'end_price_fetched_at')
            ->get();
            
        return response()->json([
            'success' => true,
            'start_prices' => $startPrices,
            'end_prices' => $endPrices,
            'total_start' => $startPrices->count(),
            'total_end' => $endPrices->count()
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
