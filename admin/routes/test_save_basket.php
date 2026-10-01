<?php

// Test route to check save basket functionality
Route::get('/test-save-basket', function() {
    try {
        \Log::info('=== TEST SAVE BASKET ROUTE ACCESSED ===');
        
        // Check if SavedBasketController exists
        $controllerExists = class_exists('App\Http\Controllers\SavedBasketController');
        
        // Check if SavedBasket model exists
        $modelExists = class_exists('App\Models\SavedBasket');
        
        // Check database connection
        $dbConnected = false;
        try {
            \DB::connection()->getPdo();
            $dbConnected = true;
        } catch (\Exception $e) {
            $dbConnected = false;
        }
        
        // Check if saved_baskets table exists
        $tableExists = \Schema::hasTable('saved_baskets');
        
        // Get sample contest data
        $contestCount = \DB::table('contests')->count();
        $sampleContest = \DB::table('contests')->first();
        
        return response()->json([
            'success' => true,
            'message' => 'Save basket test completed',
            'checks' => [
                'controller_exists' => $controllerExists,
                'model_exists' => $modelExists,
                'database_connected' => $dbConnected,
                'table_exists' => $tableExists,
                'contest_count' => $contestCount,
                'sample_contest' => $sampleContest,
            ],
            'routes' => [
                'save_basket' => url('/api/save-basket'),
                'save_standalone' => url('/api/save-standalone-basket'),
            ]
        ]);
        
    } catch (\Exception $e) {
        \Log::error('Test save basket error: ' . $e->getMessage());
        return response()->json([
            'success' => false,
            'error' => $e->getMessage()
        ], 500);
    }
});