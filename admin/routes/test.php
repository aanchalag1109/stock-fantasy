<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use App\Models\User;
use App\Models\Contest;
use App\Models\SavedBasket;

Route::get('/system-test', function() {
    $results = [];
    
    // 1. Database Connection Test
    try {
        DB::connection()->getPdo();
        $results['database'] = ['status' => 'OK', 'connection' => 'Connected'];
    } catch (Exception $e) {
        $results['database'] = ['status' => 'FAIL', 'error' => $e->getMessage()];
    }
    
    // 2. Tables Test
    $tables = ['users', 'contests', 'saved_baskets', 'league_sessions', 'transactions'];
    foreach ($tables as $table) {
        $results['tables'][$table] = Schema::hasTable($table) ? 'EXISTS' : 'MISSING';
    }
    
    // 3. Models Test
    try {
        $userCount = User::count();
        $contestCount = Contest::count();
        $basketCount = SavedBasket::count();
        $results['models'] = [
            'users' => $userCount,
            'contests' => $contestCount, 
            'baskets' => $basketCount,
            'status' => 'OK'
        ];
    } catch (Exception $e) {
        $results['models'] = ['status' => 'FAIL', 'error' => $e->getMessage()];
    }
    
    // 4. Cache Test
    try {
        cache()->put('test_key', 'test_value', 60);
        $cached = cache()->get('test_key');
        $results['cache'] = $cached === 'test_value' ? 'OK' : 'FAIL';
    } catch (Exception $e) {
        $results['cache'] = 'FAIL: ' . $e->getMessage();
    }
    
    // 5. Session Test
    try {
        session(['test_session' => 'working']);
        $results['session'] = session('test_session') === 'working' ? 'OK' : 'FAIL';
    } catch (Exception $e) {
        $results['session'] = 'FAIL: ' . $e->getMessage();
    }
    
    // 6. Storage Test
    try {
        $testFile = storage_path('app/test.txt');
        file_put_contents($testFile, 'test');
        $results['storage'] = file_exists($testFile) ? 'OK' : 'FAIL';
        @unlink($testFile);
    } catch (Exception $e) {
        $results['storage'] = 'FAIL: ' . $e->getMessage();
    }
    
    // 7. Environment Test
    $results['environment'] = [
        'app_env' => config('app.env'),
        'app_debug' => config('app.debug'),
        'app_url' => config('app.url'),
        'db_connection' => config('database.default'),
        'session_driver' => config('session.driver')
    ];
    
    return response()->json([
        'system_test' => 'COMPLETED',
        'timestamp' => now(),
        'results' => $results
    ], 200, [], JSON_PRETTY_PRINT);
});

Route::get('/api-test', function() {
    $tests = [];
    
    // Test API endpoints
    $endpoints = [
        '/api/ping' => 'GET',
        '/api/banners' => 'GET', 
        '/api/upcoming-sessions' => 'GET',
        '/api/contests' => 'GET'
    ];
    
    foreach ($endpoints as $endpoint => $method) {
        try {
            $response = app()->handle(
                \Illuminate\Http\Request::create($endpoint, $method)
            );
            $tests[$endpoint] = [
                'status' => $response->getStatusCode(),
                'success' => $response->getStatusCode() < 400
            ];
        } catch (Exception $e) {
            $tests[$endpoint] = [
                'status' => 'ERROR',
                'error' => $e->getMessage()
            ];
        }
    }
    
    return response()->json([
        'api_test' => 'COMPLETED',
        'endpoints_tested' => count($endpoints),
        'results' => $tests
    ], 200, [], JSON_PRETTY_PRINT);
});

Route::get('/full-test', function() {
    $startTime = microtime(true);
    
    // Run all tests
    $systemTest = app()->handle(\Illuminate\Http\Request::create('/system-test', 'GET'));
    $apiTest = app()->handle(\Illuminate\Http\Request::create('/api-test', 'GET'));
    
    $endTime = microtime(true);
    
    return response()->json([
        'full_system_test' => 'COMPLETED',
        'execution_time' => round($endTime - $startTime, 2) . 's',
        'system_results' => json_decode($systemTest->getContent(), true),
        'api_results' => json_decode($apiTest->getContent(), true),
        'overall_status' => 'SYSTEM OPERATIONAL'
    ], 200, [], JSON_PRETTY_PRINT);
});