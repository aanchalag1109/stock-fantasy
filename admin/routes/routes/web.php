    <?php

// routes/web.php
use Illuminate\Support\Facades\Route;
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

// Live Price API Routes
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

    Route::resource('users', UserController::class);
    Route::post('users/{user}/impersonate', [UserController::class, 'impersonate'])->name('users.impersonate');
    Route::delete('users/bulk-delete', [UserController::class, 'bulkDelete'])->name('users.bulk-delete');
    Route::post('users/{user}/wallet/add', [UserController::class, 'addToWallet'])->name('users.wallet.add');
    Route::post('users/{user}/wallet/remove', [UserController::class, 'removeFromWallet'])->name('users.wallet.remove');
    Route::post('league_sessions/update-status', [App\Http\Controllers\Admin\LeagueSessionController::class, 'updateStatus'])->name('league_sessions.update_status');
    Route::post('league_sessions/test-update', [App\Http\Controllers\Admin\LeagueSessionController::class, 'testUpdate'])->name('league_sessions.test_update');
    Route::post('league_sessions/fix-years', [App\Http\Controllers\Admin\LeagueSessionController::class, 'fixYears'])->name('league_sessions.fix_years');
    Route::get('league_sessions/template/{id}', [App\Http\Controllers\Admin\LeagueSessionController::class, 'getTemplate'])->name('league_sessions.get_template');
    Route::get('performance/{id}', [\App\Http\Controllers\Admin\PerformanceController::class, 'show'])->name('performance.show');
    Route::get('performance/{id}/live', [\App\Http\Controllers\Admin\PerformanceController::class, 'liveData'])->name('performance.live');
    Route::get('performance/{id}/user-baskets', [\App\Http\Controllers\Admin\PerformanceController::class, 'userBaskets'])->name('performance.user-baskets');
    Route::resource('templates', App\Http\Controllers\Admin\TemplateController::class)->only(['index', 'edit', 'update', 'destroy']);
    // Contest CRUD supports types: Mega Contest (fixed/flexible prize), Equal Prize Contest, Practice (free, no prize)
    Route::resource('contests', App\Http\Controllers\Admin\ContestController::class);
    Route::post('contests/bulk-delete', [App\Http\Controllers\Admin\ContestController::class, 'bulkDelete'])->name('contests.bulk_delete');
    Route::post('contests/{id}/cancel', [App\Http\Controllers\Admin\ContestController::class, 'cancelContest'])->name('contests.cancel');
    Route::post('contests/{id}/status', [App\Http\Controllers\Admin\ContestController::class, 'updateStatus'])->name('contests.update-status');
    Route::get('contests/{id}/export', [App\Http\Controllers\Admin\ContestController::class, 'exportParticipants'])->name('contests.export-participants');
    Route::get('live-management', [\App\Http\Controllers\Admin\LiveManagementController::class, 'index'])->name('live-management');
   
   
    Route::get('admin/api/contest-details/{id}', [\App\Http\Controllers\Admin\LiveManagementController::class, 'getContestDetails']);
    Route::get('api/session-leaderboard/{id}', [\App\Http\Controllers\Admin\LiveManagementController::class, 'getSessionLeaderboard']);
    Route::post('api/start-session/{id}', [\App\Http\Controllers\Admin\SessionStatusController::class, 'startSession']);
    Route::post('api/end-session/{id}', [\App\Http\Controllers\Admin\SessionStatusController::class, 'endSession']);
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
            Route::get('/{id}/live', [\App\Http\Controllers\Admin\PerformanceController::class, 'liveData'])->name('live');
        });
        
        // Performance API Routes
        Route::get('api/session-contests/{sessionId}', [\App\Http\Controllers\Admin\PerformanceController::class, 'getSessionContests']);
        Route::get('api/sessions/{sessionId}', [\App\Http\Controllers\Admin\PerformanceController::class, 'getSessionDetails']);
        Route::post('api/save-flexible-structure', [\App\Http\Controllers\Admin\PerformanceController::class, 'saveFlexibleStructure']);
        Route::get('api/get-flexible-structure/{winnerCount}', [\App\Http\Controllers\Admin\PerformanceController::class, 'getFlexibleStructure']);
        Route::get('api/get-saved-structure/{contestId}', [\App\Http\Controllers\Admin\PerformanceController::class, 'getSavedStructure']);
        
        // Testing Routes
        Route::get('/testing', [\App\Http\Controllers\Admin\TestingController::class, 'index'])->name('testing.index');
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
