<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class OptimizedPriceService
{
    protected $rapidApiKey;
    
    public function __construct()
    {
        $this->rapidApiKey = env('RAPIDAPI_KEY', 'b04e026debmsh974ec3b3aeb35d1p154a4ejsnc2f7176fb9b5');
    }
    protected $coinMarketCapKey = '0c5023c51b4247d3a0a139ee53ce5265';
    
    // Cache duration in seconds (5 minutes)
    protected $cacheTime = 300;
    
    public function getBatchStockPrices(array $symbols)
    {
        $cacheKey = 'batch_stocks_' . md5(implode(',', $symbols));
        
        return Cache::remember($cacheKey, $this->cacheTime, function() use ($symbols) {
            $results = [];
            
            // Batch process in chunks of 5 to avoid API limits
            $chunks = array_chunk($symbols, 5);
            
            foreach ($chunks as $chunk) {
                foreach ($chunk as $symbol) {
                    $stockData = $this->getSingleStockPrice($symbol);
                    if ($stockData) {
                        $results[] = $stockData;
                    }
                    
                    // Small delay to avoid rate limiting
                    usleep(200000); // 0.2 seconds
                }
            }
            
            return $results;
        });
    }
    
    public function getCachedCryptoPrices()
    {
        $cacheKey = 'crypto_prices_batch';
        
        return Cache::remember($cacheKey, $this->cacheTime, function() {
            try {
                $response = Http::withHeaders([
                    'Accept' => 'application/json',
                    'X-CMC_PRO_API_KEY' => $this->coinMarketCapKey,
                ])->timeout(10)->get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest', [
                    'limit' => 100,
                    'convert' => 'USD'
                ]);

                if ($response->successful()) {
                    $data = $response->json();
                    return $this->formatCryptoData($data['data'] ?? []);
                }
                
                Log::error('CoinMarketCap API Error: ' . $response->body());
                return [];
            } catch (\Exception $e) {
                Log::error('CoinMarketCap Exception: ' . $e->getMessage());
                return [];
            }
        });
    }
    
    protected function getSingleStockPrice(string $symbol)
    {
        try {
            $response = Http::withHeaders([
                'x-rapidapi-host' => 'indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com',
                'x-rapidapi-key' => $this->rapidApiKey,
            ])->timeout(10)->get('https://indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com/v1/rapidapi/stock/quote', [
                'tradingSymbol' => $symbol,
                'exchange' => 'NSE',
            ]);

            if ($response->successful()) {
                $data = $response->json();
                return [
                    'symbol' => $data['tradingSymbol'] ?? $symbol,
                    'name' => $data['companyName'] ?? $symbol,
                    'price' => $data['lastPrice'] ?? 0,
                    'change' => $data['change'] ?? 0,
                    'change_percent' => $data['pChange'] ?? 0,
                    'volume' => $data['totalTradedVolume'] ?? 0,
                    'status' => 'success',
                    'last_updated' => now()
                ];
            }
            
            return null;
        } catch (\Exception $e) {
            Log::error("Stock API Error for {$symbol}: " . $e->getMessage());
            return null;
        }
    }
    
    protected function formatCryptoData(array $cryptos)
    {
        $results = [];
        foreach ($cryptos as $crypto) {
            $quote = $crypto['quote']['USD'] ?? [];
            $results[] = [
                'symbol' => $crypto['symbol'] ?? '',
                'name' => $crypto['name'] ?? '',
                'price' => $quote['price'] ?? 0,
                'change' => $quote['price_change_24h'] ?? 0,
                'change_percent' => $quote['percent_change_24h'] ?? 0,
                'volume' => $quote['volume_24h'] ?? 0,
                'market_cap' => $quote['market_cap'] ?? 0,
                'rank' => $crypto['cmc_rank'] ?? 0,
                'status' => 'success',
                'last_updated' => now()
            ];
        }
        return $results;
    }
    
    // Get cached price for specific symbol
    public function getCachedPrice(string $symbol, string $type = 'stock')
    {
        if ($type === 'crypto') {
            $cryptos = $this->getCachedCryptoPrices();
            $cleanSymbol = str_replace('-USD', '', $symbol);
            return collect($cryptos)->firstWhere('symbol', $cleanSymbol);
        } else {
            $cacheKey = "stock_price_{$symbol}";
            return Cache::get($cacheKey);
        }
    }
    
    // Clear all price caches
    public function clearPriceCache()
    {
        $patterns = [
            'batch_stocks_*',
            'crypto_prices_batch',
            'stock_price_*'
        ];
        
        foreach ($patterns as $pattern) {
            Cache::forget($pattern);
        }
    }
}