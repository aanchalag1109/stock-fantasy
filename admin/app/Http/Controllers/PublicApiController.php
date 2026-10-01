<?php

namespace App\Http\Controllers;

use App\Models\MarketTypeCategory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class PublicApiController extends Controller
{
    public function getCategories($type)
    {
        $categories = MarketTypeCategory::where('category_type', $type)
            ->where('status', 'active')
            ->get(['id', 'name']);
        
        return response()->json($categories);
    }

    public function getRapidApiStocks(Request $request)
    {
        try {
            $symbols = $request->get('symbols', 'AAPL,GOOGL,MSFT');
            
            $response = Http::withHeaders([
                'X-RapidAPI-Key' => env('RAPIDAPI_KEY', 'your-rapidapi-key'),
                'X-RapidAPI-Host' => 'alpha-vantage.p.rapidapi.com'
            ])->get('https://alpha-vantage.p.rapidapi.com/query', [
                'function' => 'GLOBAL_QUOTE',
                'symbol' => $symbols,
                'apikey' => env('ALPHA_VANTAGE_KEY', 'demo')
            ]);

            return response()->json($response->json());
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch stock data'], 500);
        }
    }

    public function getBinanceCrypto(Request $request)
    {
        try {
            $symbols = $request->get('symbols', 'BTCUSDT,ETHUSDT,ADAUSDT');
            $symbolArray = explode(',', $symbols);
            
            $data = [];
            foreach ($symbolArray as $symbol) {
                $response = Http::get('https://api.binance.com/api/v3/ticker/24hr', [
                    'symbol' => strtoupper(trim($symbol))
                ]);
                
                if ($response->successful()) {
                    $data[] = $response->json();
                }
            }

            return response()->json($data);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch crypto data'], 500);
        }
    }
}