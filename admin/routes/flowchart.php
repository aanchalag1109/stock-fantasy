<?php

use Illuminate\Support\Facades\Route;

Route::get('/flowchart', function() {
    return response()->file(public_path('contest-flowchart.html'));
});

Route::get('/test-flow', function() {
    return response()->json([
        'flowchart_url' => url('/flowchart'),
        'test_url' => url('/simple-contest-test'),
        'flow_steps' => [
            '1. START TEST 🚀',
            '2. CREATE LEAGUE SESSION 📅',
            '3. CREATE CONTEST 🏆',
            '4. CREATE 5 TEST USERS 👥',
            '5. CREATE PORTFOLIOS 📊',
            '6. START CONTEST ▶️',
            '7. SAVE START PRICES 💹',
            '8. END CONTEST ⏹️',
            '9. SAVE END PRICES 📈',
            '10. CALCULATE SCORES 🧮',
            '11. TEST COMPLETED ✅'
        ],
        'message' => 'Visit /flowchart to see visual flow diagram'
    ], 200, [], JSON_PRETTY_PRINT);
});