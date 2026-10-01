<?php

use Illuminate\Support\Facades\Route;

// Simple test endpoint
Route::get('/test-live-feeds', function() {
    try {
        $controller = new \App\Http\Controllers\Admin\LivePriceFeedController();
        $response = $controller->getLivePriceFeeds();
        return $response;
    } catch (\Exception $e) {
        return response()->json([
            'error' => $e->getMessage(),
            'line' => $e->getLine(),
            'file' => basename($e->getFile())
        ], 500);
    }
});

// Include existing API routes
require __DIR__ . '/api.php';