<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Services\RapidApiStockService;
use App\Services\CoinMarketCapService;

class LivePriceController extends Controller
{
    public function getLivePrices(Request $request)
    {
        try {
            $assets = DB::table('assets')
                ->where('status', 'active')
                ->select('symbol', 'name', 'type')
                ->get();

            $stocks = [];
            $crypto = [];

            foreach ($assets as $asset) {
                $data = [
                    'symbol' => $asset->symbol,
                    'name' => $asset->name,
                    'price' => 0,
                    'current_price' => 0,
                    'change_percent' => 0,
                    'price_change' => 0
                ];

                if ($asset->type === 'crypto') {
                    $crypto[] = $data;
                } else {
                    $stocks[] = $data;
                }
            }

            return response()->json([
                'success' => true,
                'timestamp' => now()->toISOString(),
                'stocks' => $stocks,
                'crypto' => $crypto
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function getStockLivePrice(Request $request)
    {
        try {
            $symbol = $request->input('symbol');
            $rapidApi = new RapidApiStockService();
            $data = $rapidApi->getStockQuote($symbol);
            
            
    
            if (!$data) {
                return response()->json(['success' => false, 'error' => 'Stock not found'], 404);
            }

            return response()->json([
                'success' => true,
                'symbol' => $data['tradingSymbol'] ?? $symbol,
                'name' => $data['companyName'] ?? $symbol,
                'price' => $data['lastPrice'] ?? 0,
                'change' => $data['change'] ?? 0,
                'change_percent' => $data['pChange'] ?? 0,
                'volume' => $data['totalTradedVolume'] ?? 0,
                'timestamp' => now()->toISOString()
            ]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    public function getCryptoLivePrice(Request $request)
    {
        try {
            $coinMarketCap = new CoinMarketCapService();
            $cryptos = $coinMarketCap->getCryptoListings(100);

            if (empty($cryptos)) {
                return response()->json(['success' => false, 'error' => 'No crypto data'], 404);
            }

            return response()->json([
                'success' => true,
                'data' => $cryptos,
                'timestamp' => now()->toISOString()
            ]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }
}
