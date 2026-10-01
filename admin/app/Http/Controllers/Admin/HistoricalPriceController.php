<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Carbon\Carbon;

class HistoricalPriceController extends Controller
{
    public function verifyHistoricalPrices($sessionId)
    {
        try {
            \Log::info('Starting historical price verification for session: ' . $sessionId);
            
            // Get session details
            $session = \DB::table('league_sessions')->where('id', $sessionId)->first();
            if (!$session) {
                return response()->json(['success' => false, 'error' => 'Session not found']);
            }
            
            // Get all saved prices for this session
            $savedPrices = \DB::table('session_asset_prices')
                ->where('league_session_id', $sessionId)
                ->get();
                
            if ($savedPrices->isEmpty()) {
                return response()->json(['success' => false, 'error' => 'No saved prices found for this session']);
            }
            
            $verificationResults = [];
            
            foreach ($savedPrices as $savedPrice) {
                // Verify start price if exists
                if ($savedPrice->start_price) {
                    $startTime = Carbon::parse($session->start_time);
                    $apiPrice = $this->getHistoricalPrice($savedPrice->asset_symbol, $startTime);
                    
                    $result = [
                        'asset_symbol' => $savedPrice->asset_symbol,
                        'price_type' => 'start',
                        'our_price' => floatval($savedPrice->start_price),
                        'api_price' => $apiPrice['price'],
                        'api_source' => $apiPrice['source'],
                        'api_error' => $apiPrice['error'],
                        'timestamp' => $startTime->toISOString(),
                        'difference_amount' => 0,
                        'difference_percent' => 0
                    ];
                    
                    if (!$apiPrice['error'] && $apiPrice['price'] > 0) {
                        $result['difference_amount'] = $apiPrice['price'] - floatval($savedPrice->start_price);
                        $result['difference_percent'] = (($result['difference_amount'] / floatval($savedPrice->start_price)) * 100);
                    }
                    
                    $verificationResults[] = $result;
                }
                
                // Verify end price if exists
                if ($savedPrice->end_price) {
                    $endTime = Carbon::parse($session->end_time);
                    $apiPrice = $this->getHistoricalPrice($savedPrice->asset_symbol, $endTime);
                    
                    $result = [
                        'asset_symbol' => $savedPrice->asset_symbol,
                        'price_type' => 'end',
                        'our_price' => floatval($savedPrice->end_price),
                        'api_price' => $apiPrice['price'],
                        'api_source' => $apiPrice['source'],
                        'api_error' => $apiPrice['error'],
                        'timestamp' => $endTime->toISOString(),
                        'difference_amount' => 0,
                        'difference_percent' => 0
                    ];
                    
                    if (!$apiPrice['error'] && $apiPrice['price'] > 0) {
                        $result['difference_amount'] = $apiPrice['price'] - floatval($savedPrice->end_price);
                        $result['difference_percent'] = (($result['difference_amount'] / floatval($savedPrice->end_price)) * 100);
                    }
                    
                    $verificationResults[] = $result;
                }
            }
            
            \Log::info('Historical price verification completed', ['results_count' => count($verificationResults)]);
            
            return response()->json([
                'success' => true,
                'verification_results' => $verificationResults,
                'session_details' => [
                    'start_time' => $session->start_time,
                    'end_time' => $session->end_time,
                    'status' => $session->status
                ]
            ]);
            
        } catch (\Exception $e) {
            \Log::error('Historical price verification error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'error' => 'Verification failed: ' . $e->getMessage()
            ], 500);
        }
    }
    
    private function getHistoricalPrice($symbol, $timestamp)
    {
        try {
            // Determine if it's a crypto or stock symbol
            $isCrypto = strpos($symbol, '-USD') !== false;
            
            if ($isCrypto) {
                return $this->getCryptoHistoricalPrice($symbol, $timestamp);
            } else {
                return $this->getStockHistoricalPrice($symbol, $timestamp);
            }
            
        } catch (\Exception $e) {
            \Log::error("Error getting historical price for {$symbol}: " . $e->getMessage());
            return [
                'price' => 0,
                'source' => 'Error',
                'error' => $e->getMessage()
            ];
        }
    }
    
    private function getCryptoHistoricalPrice($symbol, $timestamp)
    {
        try {
            $cleanSymbol = str_replace('-USD', '', $symbol);
            
            // Use CoinMarketCap API that's already being used in the project
            $response = Http::timeout(10)->withHeaders([
                'X-CMC_PRO_API_KEY' => '0c5023c51b4247d3a0a139ee53ce5265'
            ])->get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', [
                'symbol' => $cleanSymbol
            ]);
            
            if ($response->successful()) {
                $data = $response->json();
                if (isset($data['data'][$cleanSymbol]['quote']['USD']['price'])) {
                    return [
                        'price' => $data['data'][$cleanSymbol]['quote']['USD']['price'],
                        'source' => 'CoinMarketCap (Current)',
                        'error' => null
                    ];
                }
            }
            
            // Fallback: Try CoinGecko for historical data
            $date = $timestamp->format('d-m-Y'); // CoinGecko format
            $responseGecko = Http::timeout(10)->get('https://api.coingecko.com/api/v3/coins/' . strtolower($cleanSymbol) . '/history', [
                'date' => $date,
                'localization' => false
            ]);
            
            if ($responseGecko->successful()) {
                $dataGecko = $responseGecko->json();
                if (isset($dataGecko['market_data']['current_price']['usd'])) {
                    return [
                        'price' => $dataGecko['market_data']['current_price']['usd'],
                        'source' => 'CoinGecko Historical',
                        'error' => null
                    ];
                }
            }
            
            // Final fallback: CoinGecko current price
            $currentResponse = Http::timeout(5)->get('https://api.coingecko.com/api/v3/simple/price', [
                'ids' => strtolower($cleanSymbol),
                'vs_currencies' => 'usd'
            ]);
            
            if ($currentResponse->successful()) {
                $currentData = $currentResponse->json();
                if (isset($currentData[strtolower($cleanSymbol)]['usd'])) {
                    return [
                        'price' => $currentData[strtolower($cleanSymbol)]['usd'],
                        'source' => 'CoinGecko Current',
                        'error' => null
                    ];
                }
            }
            
            return [
                'price' => 0,
                'source' => 'Multiple APIs',
                'error' => 'No price data available for ' . $cleanSymbol
            ];
            
        } catch (\Exception $e) {
            return [
                'price' => 0,
                'source' => 'Crypto APIs',
                'error' => $e->getMessage()
            ];
        }
    }
    
    private function getStockHistoricalPrice($symbol, $timestamp)
    {
        try {
            // Use the same RapidAPI that's already being used in the project
            $response = Http::timeout(10)->withHeaders([
                'x-rapidapi-host' => 'indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com',
                'x-rapidapi-key' => env('RAPIDAPI_KEY', 'b04e026debmsh974ec3b3aeb35d1p154a4ejsnc2f7176fb9b5')
            ])->get('https://indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com/v1/rapidapi/stock/quote', [
                'tradingSymbol' => $symbol,
                'exchange' => 'NSE'
            ]);
            
            if ($response->successful()) {
                $data = $response->json();
                if (isset($data['lastPrice']) && $data['lastPrice'] > 0) {
                    return [
                        'price' => floatval($data['lastPrice']),
                        'source' => 'RapidAPI NSE (Current)',
                        'error' => null
                    ];
                }
            }
            
            // Fallback: Try BSE if NSE fails
            $responseBSE = Http::timeout(10)->withHeaders([
                'x-rapidapi-host' => 'indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com',
                'x-rapidapi-key' => env('RAPIDAPI_KEY', 'b04e026debmsh974ec3b3aeb35d1p154a4ejsnc2f7176fb9b5')
            ])->get('https://indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com/v1/rapidapi/stock/quote', [
                'tradingSymbol' => $symbol,
                'exchange' => 'BSE'
            ]);
            
            if ($responseBSE->successful()) {
                $dataBSE = $responseBSE->json();
                if (isset($dataBSE['lastPrice']) && $dataBSE['lastPrice'] > 0) {
                    return [
                        'price' => floatval($dataBSE['lastPrice']),
                        'source' => 'RapidAPI BSE (Current)',
                        'error' => null
                    ];
                }
            }
            
            return [
                'price' => 0,
                'source' => 'RapidAPI',
                'error' => 'No price data available for ' . $symbol
            ];
            
        } catch (\Exception $e) {
            return [
                'price' => 0,
                'source' => 'RapidAPI',
                'error' => $e->getMessage()
            ];
        }
    }
    
    private function getYahooFinancePrice($symbol, $timestamp)
    {
        try {
            // Since Yahoo Finance API is restricted, we'll use the same RapidAPI as fallback
            $response = Http::timeout(5)->withHeaders([
                'x-rapidapi-host' => 'indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com',
                'x-rapidapi-key' => env('RAPIDAPI_KEY', 'b04e026debmsh974ec3b3aeb35d1p154a4ejsnc2f7176fb9b5')
            ])->get('https://indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com/v1/rapidapi/stock/quote', [
                'tradingSymbol' => $symbol,
                'exchange' => 'NSE'
            ]);
            
            if ($response->successful()) {
                $data = $response->json();
                if (isset($data['lastPrice']) && $data['lastPrice'] > 0) {
                    return [
                        'price' => floatval($data['lastPrice']),
                        'source' => 'RapidAPI Fallback',
                        'error' => null
                    ];
                }
            }
            
            return [
                'price' => 0,
                'source' => 'RapidAPI Fallback',
                'error' => 'No fallback data available for ' . $symbol
            ];
            
        } catch (\Exception $e) {
            return [
                'price' => 0,
                'source' => 'RapidAPI Fallback',
                'error' => $e->getMessage()
            ];
        }
    }
}