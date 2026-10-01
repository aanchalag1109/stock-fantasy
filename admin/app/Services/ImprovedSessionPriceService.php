<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;
use Exception;

class ImprovedSessionPriceService
{
    private $priceFetcher;
    
    public function __construct(RobustPriceFetchingService $priceFetcher)
    {
        $this->priceFetcher = $priceFetcher;
    }
    
    /**
     * Save session start prices with improved timing
     */
    public function saveSessionStartPrices($sessionId)
    {
        try {
            $session = DB::table('league_sessions')->where('id', $sessionId)->first();
            if (!$session) {
                throw new Exception("Session {$sessionId} not found");
            }
            
            // Get session assets
            $assets = DB::table('league_session_assets')
                ->where('league_session_id', $sessionId)
                ->pluck('asset_symbol')
                ->toArray();
                
            if (empty($assets)) {
                throw new Exception("No assets found for session {$sessionId}");
            }
            
            Log::info("Starting price capture for session", [
                'session_id' => $sessionId,
                'asset_count' => count($assets),
                'session_start_time' => $session->start_time
            ]);
            
            $results = [];
            $successCount = 0;
            $failureCount = 0;
            
            // Capture prices as close to session start as possible
            $captureTime = now();
            
            foreach ($assets as $symbol) {
                try {
                    // Fetch price with fallback sources
                    $priceResult = $this->priceFetcher->fetchStockPrice($symbol);
                    
                    if ($priceResult['success']) {
                        // Check if price already exists
                        $existing = DB::table('session_asset_prices')
                            ->where('league_session_id', $sessionId)
                            ->where('asset_symbol', $symbol)
                            ->first();
                            
                        if ($existing) {
                            // Update existing record
                            DB::table('session_asset_prices')
                                ->where('id', $existing->id)
                                ->update([
                                    'start_price' => $priceResult['price'],
                                    'start_price_fetched_at' => $captureTime,
                                    'start_price_source' => $priceResult['source'],
                                    'updated_at' => now()
                                ]);
                        } else {
                            // Create new record
                            DB::table('session_asset_prices')->insert([
                                'league_session_id' => $sessionId,
                                'asset_symbol' => $symbol,
                                'start_price' => $priceResult['price'],
                                'start_price_fetched_at' => $captureTime,
                                'start_price_source' => $priceResult['source'],
                                'created_at' => now(),
                                'updated_at' => now()
                            ]);
                        }
                        
                        $results[$symbol] = [
                            'success' => true,
                            'price' => $priceResult['price'],
                            'source' => $priceResult['source']
                        ];
                        
                        $successCount++;
                        
                        Log::info("Start price saved", [
                            'session_id' => $sessionId,
                            'symbol' => $symbol,
                            'price' => $priceResult['price'],
                            'source' => $priceResult['source']
                        ]);
                        
                    } else {
                        $results[$symbol] = [
                            'success' => false,
                            'error' => $priceResult['error'],
                            'source' => $priceResult['source']
                        ];
                        
                        $failureCount++;
                        
                        Log::error("Failed to fetch start price", [
                            'session_id' => $sessionId,
                            'symbol' => $symbol,
                            'error' => $priceResult['error']
                        ]);
                    }
                    
                } catch (Exception $e) {
                    $results[$symbol] = [
                        'success' => false,
                        'error' => $e->getMessage()
                    ];
                    
                    $failureCount++;
                    
                    Log::error("Exception during start price fetch", [
                        'session_id' => $sessionId,
                        'symbol' => $symbol,
                        'error' => $e->getMessage()
                    ]);
                }
            }
            
            return [
                'success' => true,
                'session_id' => $sessionId,
                'total_assets' => count($assets),
                'successful_prices' => $successCount,
                'failed_prices' => $failureCount,
                'capture_time' => $captureTime->toISOString(),
                'results' => $results
            ];
            
        } catch (Exception $e) {
            Log::error("Session start price capture failed", [
                'session_id' => $sessionId,
                'error' => $e->getMessage()
            ]);
            
            return [
                'success' => false,
                'error' => $e->getMessage()
            ];
        }
    }
    
    /**
     * Save session end prices with minimal delay
     */
    public function saveSessionEndPrices($sessionId)
    {
        try {
            $session = DB::table('league_sessions')->where('id', $sessionId)->first();
            if (!$session) {
                throw new Exception("Session {$sessionId} not found");
            }
            
            // Get assets that have start prices
            $assetPrices = DB::table('session_asset_prices')
                ->where('league_session_id', $sessionId)
                ->whereNotNull('start_price')
                ->get();
                
            if ($assetPrices->isEmpty()) {
                throw new Exception("No start prices found for session {$sessionId}");
            }
            
            Log::info("Starting end price capture for session", [
                'session_id' => $sessionId,
                'asset_count' => $assetPrices->count(),
                'session_end_time' => $session->end_time
            ]);
            
            $results = [];
            $successCount = 0;
            $failureCount = 0;
            
            // Capture end prices immediately (reduce timing gap)
            $captureTime = now();
            
            foreach ($assetPrices as $assetPrice) {
                try {
                    // Fetch current price
                    $priceResult = $this->priceFetcher->fetchStockPrice($assetPrice->asset_symbol);
                    
                    if ($priceResult['success']) {
                        // Validate price against start price
                        $validation = $this->priceFetcher->validatePrice(
                            $assetPrice->asset_symbol,
                            $priceResult['price'],
                            $assetPrice->start_price
                        );
                        
                        if (!$validation['valid']) {
                            Log::warning("Price validation failed", [
                                'symbol' => $assetPrice->asset_symbol,
                                'start_price' => $assetPrice->start_price,
                                'end_price' => $priceResult['price'],
                                'reason' => $validation['reason']
                            ]);
                        }
                        
                        // Update with end price
                        DB::table('session_asset_prices')
                            ->where('id', $assetPrice->id)
                            ->update([
                                'end_price' => $priceResult['price'],
                                'end_price_fetched_at' => $captureTime,
                                'end_price_source' => $priceResult['source'],
                                'price_change' => $priceResult['price'] - $assetPrice->start_price,
                                'price_change_percent' => (($priceResult['price'] - $assetPrice->start_price) / $assetPrice->start_price) * 100,
                                'updated_at' => now()
                            ]);
                        
                        $results[$assetPrice->asset_symbol] = [
                            'success' => true,
                            'start_price' => $assetPrice->start_price,
                            'end_price' => $priceResult['price'],
                            'change' => $priceResult['price'] - $assetPrice->start_price,
                            'change_percent' => (($priceResult['price'] - $assetPrice->start_price) / $assetPrice->start_price) * 100,
                            'source' => $priceResult['source'],
                            'validation' => $validation
                        ];
                        
                        $successCount++;
                        
                    } else {
                        $results[$assetPrice->asset_symbol] = [
                            'success' => false,
                            'error' => $priceResult['error'],
                            'source' => $priceResult['source']
                        ];
                        
                        $failureCount++;
                    }
                    
                } catch (Exception $e) {
                    $results[$assetPrice->asset_symbol] = [
                        'success' => false,
                        'error' => $e->getMessage()
                    ];
                    
                    $failureCount++;
                }
            }
            
            return [
                'success' => true,
                'session_id' => $sessionId,
                'total_assets' => $assetPrices->count(),
                'successful_prices' => $successCount,
                'failed_prices' => $failureCount,
                'capture_time' => $captureTime->toISOString(),
                'results' => $results
            ];
            
        } catch (Exception $e) {
            Log::error("Session end price capture failed", [
                'session_id' => $sessionId,
                'error' => $e->getMessage()
            ]);
            
            return [
                'success' => false,
                'error' => $e->getMessage()
            ];
        }
    }
    
    /**
     * Continuous price monitoring during session
     */
    public function monitorSessionPrices($sessionId, $intervalMinutes = 1)
    {
        try {
            $session = DB::table('league_sessions')->where('id', $sessionId)->first();
            if (!$session || $session->status !== 'live') {
                return ['success' => false, 'message' => 'Session not live'];
            }
            
            // Get last price update time
            $lastUpdate = DB::table('session_asset_prices')
                ->where('league_session_id', $sessionId)
                ->max('end_price_fetched_at');
                
            $now = now();
            $shouldUpdate = false;
            
            if (!$lastUpdate) {
                // No end prices yet, check if enough time passed since start
                $sessionStart = Carbon::parse($session->start_time);
                if ($now->diffInMinutes($sessionStart) >= $intervalMinutes) {
                    $shouldUpdate = true;
                }
            } else {
                // Check if enough time passed since last update
                $lastUpdateTime = Carbon::parse($lastUpdate);
                if ($now->diffInMinutes($lastUpdateTime) >= $intervalMinutes) {
                    $shouldUpdate = true;
                }
            }
            
            if ($shouldUpdate) {
                return $this->saveSessionEndPrices($sessionId);
            }
            
            return [
                'success' => true,
                'message' => 'No update needed yet',
                'next_update_in' => $intervalMinutes - ($lastUpdate ? $now->diffInMinutes(Carbon::parse($lastUpdate)) : 0)
            ];
            
        } catch (Exception $e) {
            Log::error("Price monitoring failed", [
                'session_id' => $sessionId,
                'error' => $e->getMessage()
            ]);
            
            return [
                'success' => false,
                'error' => $e->getMessage()
            ];
        }
    }
}