<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class OptimizedLivePriceController extends Controller
{
    public function getBatchLivePrices(Request $request)
    {
        try {
            $sessionId = $request->get('session_id');
            
            if (!$sessionId) {
                return response()->json(['error' => 'Session ID required'], 400);
            }

            // Get session assets
            $assets = \DB::table('league_session_assets')
                ->leftJoin('assets', 'league_session_assets.asset_symbol', '=', 'assets.symbol')
                ->where('league_session_assets.league_session_id', $sessionId)
                ->select('league_session_assets.asset_symbol as symbol', 'assets.name', 'assets.type')
                ->get();

            if ($assets->isEmpty()) {
                return response()->json(['error' => 'No assets found for session'], 404);
            }

            // Get session market type
            $session = \DB::table('league_sessions')->where('id', $sessionId)->first();
            $marketType = $session->market_type ?? 'stock';

            $priceData = [];
            foreach ($assets as $asset) {
                $cacheKey = "live_price_{$asset->symbol}";
                $cachedPrice = Cache::get($cacheKey);
                
                if ($cachedPrice) {
                    $priceData[] = $cachedPrice;
                } else {
                    $price = $this->getCurrentPrice($asset->symbol, $marketType);
                    $data = [
                        'symbol' => $asset->symbol,
                        'name' => $asset->name ?? $asset->symbol,
                        'price' => $price,
                        'change' => 0,
                        'change_percent' => 0,
                        'timestamp' => now()->toISOString()
                    ];
                    
                    Cache::put($cacheKey, $data, 300); // 5 minutes
                    $priceData[] = $data;
                }
            }

            return response()->json([
                'success' => true,
                'session_id' => $sessionId,
                'market_type' => $marketType,
                'prices' => $priceData,
                'timestamp' => now()->toISOString()
            ]);

        } catch (\Exception $e) {
            Log::error('Batch live prices error: ' . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function getSingleAssetPrice(Request $request)
    {
        try {
            $symbol = $request->get('symbol');
            $marketType = $request->get('market_type', 'stock');
            
            if (!$symbol) {
                return response()->json(['error' => 'Symbol required'], 400);
            }

            $price = $this->getCurrentPrice($symbol, $marketType);
            
            return response()->json([
                'success' => true,
                'symbol' => $symbol,
                'price' => $price,
                'market_type' => $marketType,
                'timestamp' => now()->toISOString()
            ]);

        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function getCacheStatus(Request $request)
    {
        try {
            $sessionId = $request->get('session_id');
            
            if (!$sessionId) {
                return response()->json(['error' => 'Session ID required'], 400);
            }

            // Get session assets
            $assets = \DB::table('league_session_assets')
                ->where('league_session_id', $sessionId)
                ->pluck('asset_symbol');

            $cacheStatus = [];
            foreach ($assets as $symbol) {
                $cacheKey = "live_price_{$symbol}";
                $cached = Cache::has($cacheKey);
                $cacheStatus[$symbol] = $cached;
            }

            return response()->json([
                'success' => true,
                'session_id' => $sessionId,
                'cache_status' => $cacheStatus,
                'cached_count' => count(array_filter($cacheStatus)),
                'total_assets' => count($cacheStatus)
            ]);

        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function clearCache(Request $request)
    {
        try {
            $sessionId = $request->get('session_id');
            
            if ($sessionId) {
                // Clear cache for specific session
                $assets = \DB::table('league_session_assets')
                    ->where('league_session_id', $sessionId)
                    ->pluck('asset_symbol');

                $cleared = 0;
                foreach ($assets as $symbol) {
                    $cacheKey = "live_price_{$symbol}";
                    if (Cache::forget($cacheKey)) {
                        $cleared++;
                    }
                }

                return response()->json([
                    'success' => true,
                    'message' => "Cleared cache for {$cleared} assets in session {$sessionId}"
                ]);
            } else {
                // Clear all price cache
                Cache::flush();
                return response()->json([
                    'success' => true,
                    'message' => 'All cache cleared'
                ]);
            }

        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    private function getCurrentPrice($symbol, $marketType)
    {
        try {
            if ($marketType === 'crypto') {
                $response = Http::timeout(5)->withHeaders([
                    'X-CMC_PRO_API_KEY' => '0c5023c51b4247d3a0a139ee53ce5265'
                ])->get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', [
                    'symbol' => str_replace('-USD', '', $symbol)
                ]);

                if ($response->successful()) {
                    $data = $response->json();
                    $cleanSymbol = str_replace('-USD', '', $symbol);
                    return $data['data'][$cleanSymbol]['quote']['USD']['price'] ?? 0;
                }
            } else {
                $response = Http::timeout(5)->withHeaders([
                    'x-rapidapi-host' => 'indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com',
                    'x-rapidapi-key' => env('RAPIDAPI_KEY', 'b04e026debmsh974ec3b3aeb35d1p154a4ejsnc2f7176fb9b5')
                ])->get('https://indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com/v1/rapidapi/stock/quote', [
                    'tradingSymbol' => $symbol,
                    'exchange' => 'NSE'
                ]);

                if ($response->successful()) {
                    $data = $response->json();
                    return $data['lastPrice'] ?? 0;
                }
            }
        } catch (\Exception $e) {
            Log::error("Error fetching price for {$symbol}: " . $e->getMessage());
        }
        
        return 0;
    }
}