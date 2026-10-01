<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Exception;

class RobustPriceFetchingService
{
    private $apiSources = [
        'rapidapi_nse' => [
            'url' => 'https://latest-stock-price.p.rapidapi.com/price',
            'headers' => [
                'X-RapidAPI-Key' => 'your-rapidapi-key',
                'X-RapidAPI-Host' => 'latest-stock-price.p.rapidapi.com'
            ],
            'timeout' => 10
        ],
        'yahoo_finance' => [
            'url' => 'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}.NS',
            'headers' => [],
            'timeout' => 8
        ],
        'alpha_vantage' => [
            'url' => 'https://www.alphavantage.co/query',
            'headers' => [],
            'timeout' => 12
        ],
        'polygon_io' => [
            'url' => 'https://api.polygon.io/v2/aggs/ticker/{symbol}/prev',
            'headers' => [
                'Authorization' => 'Bearer your-polygon-key'
            ],
            'timeout' => 10
        ]
    ];

    /**
     * Fetch stock price with multiple fallback sources
     */
    public function fetchStockPrice($symbol, $maxRetries = 3)
    {
        $cacheKey = "stock_price_{$symbol}_" . now()->format('Y-m-d-H-i');
        
        // Check cache first (1-minute cache)
        if (Cache::has($cacheKey)) {
            $cached = Cache::get($cacheKey);
            Log::info("Price fetched from cache", ['symbol' => $symbol, 'price' => $cached['price']]);
            return $cached;
        }

        $lastError = null;
        
        // Try each API source
        foreach ($this->apiSources as $sourceName => $config) {
            for ($attempt = 1; $attempt <= $maxRetries; $attempt++) {
                try {
                    Log::info("Attempting price fetch", [
                        'symbol' => $symbol,
                        'source' => $sourceName,
                        'attempt' => $attempt
                    ]);
                    
                    $result = $this->fetchFromSource($symbol, $sourceName, $config);
                    
                    if ($result['success']) {
                        // Cache successful result
                        Cache::put($cacheKey, $result, 60); // 1 minute cache
                        
                        Log::info("Price fetched successfully", [
                            'symbol' => $symbol,
                            'source' => $sourceName,
                            'price' => $result['price'],
                            'attempt' => $attempt
                        ]);
                        
                        return $result;
                    }
                    
                } catch (Exception $e) {
                    $lastError = $e->getMessage();
                    Log::warning("Price fetch attempt failed", [
                        'symbol' => $symbol,
                        'source' => $sourceName,
                        'attempt' => $attempt,
                        'error' => $e->getMessage()
                    ]);
                    
                    // Wait before retry (exponential backoff)
                    if ($attempt < $maxRetries) {
                        sleep(pow(2, $attempt - 1)); // 1s, 2s, 4s delays
                    }
                }
            }
        }
        
        // All sources failed
        Log::error("All price sources failed", [
            'symbol' => $symbol,
            'last_error' => $lastError
        ]);
        
        return [
            'success' => false,
            'price' => null,
            'source' => 'All APIs Failed',
            'error' => $lastError ?? 'All API sources exhausted',
            'timestamp' => now()->toISOString()
        ];
    }
    
    /**
     * Fetch price from specific source
     */
    private function fetchFromSource($symbol, $sourceName, $config)
    {
        switch ($sourceName) {
            case 'rapidapi_nse':
                return $this->fetchFromRapidAPI($symbol, $config);
            case 'yahoo_finance':
                return $this->fetchFromYahoo($symbol, $config);
            case 'alpha_vantage':
                return $this->fetchFromAlphaVantage($symbol, $config);
            case 'polygon_io':
                return $this->fetchFromPolygon($symbol, $config);
            default:
                throw new Exception("Unknown API source: {$sourceName}");
        }
    }
    
    /**
     * Fetch from RapidAPI NSE
     */
    private function fetchFromRapidAPI($symbol, $config)
    {
        $response = Http::timeout($config['timeout'])
            ->withHeaders($config['headers'])
            ->get($config['url'], ['Symbols' => $symbol]);
            
        if (!$response->successful()) {
            throw new Exception("RapidAPI HTTP {$response->status()}: {$response->body()}");
        }
        
        $data = $response->json();
        
        if (!isset($data[0]['lastPrice'])) {
            throw new Exception("Invalid RapidAPI response format");
        }
        
        return [
            'success' => true,
            'price' => floatval($data[0]['lastPrice']),
            'source' => 'RapidAPI NSE',
            'timestamp' => now()->toISOString(),
            'raw_data' => $data[0]
        ];
    }
    
    /**
     * Fetch from Yahoo Finance
     */
    private function fetchFromYahoo($symbol, $config)
    {
        $url = str_replace('{symbol}', $symbol, $config['url']);
        
        $response = Http::timeout($config['timeout'])->get($url);
        
        if (!$response->successful()) {
            throw new Exception("Yahoo Finance HTTP {$response->status()}");
        }
        
        $data = $response->json();
        
        if (!isset($data['chart']['result'][0]['meta']['regularMarketPrice'])) {
            throw new Exception("Invalid Yahoo Finance response format");
        }
        
        $price = $data['chart']['result'][0]['meta']['regularMarketPrice'];
        
        return [
            'success' => true,
            'price' => floatval($price),
            'source' => 'Yahoo Finance',
            'timestamp' => now()->toISOString()
        ];
    }
    
    /**
     * Fetch from Alpha Vantage
     */
    private function fetchFromAlphaVantage($symbol, $config)
    {
        $response = Http::timeout($config['timeout'])
            ->get($config['url'], [
                'function' => 'GLOBAL_QUOTE',
                'symbol' => $symbol . '.BSE', // Bombay Stock Exchange
                'apikey' => env('ALPHA_VANTAGE_KEY')
            ]);
            
        if (!$response->successful()) {
            throw new Exception("Alpha Vantage HTTP {$response->status()}");
        }
        
        $data = $response->json();
        
        if (!isset($data['Global Quote']['05. price'])) {
            throw new Exception("Invalid Alpha Vantage response format");
        }
        
        return [
            'success' => true,
            'price' => floatval($data['Global Quote']['05. price']),
            'source' => 'Alpha Vantage',
            'timestamp' => now()->toISOString()
        ];
    }
    
    /**
     * Fetch from Polygon.io
     */
    private function fetchFromPolygon($symbol, $config)
    {
        $url = str_replace('{symbol}', $symbol, $config['url']);
        
        $response = Http::timeout($config['timeout'])
            ->withHeaders($config['headers'])
            ->get($url);
            
        if (!$response->successful()) {
            throw new Exception("Polygon.io HTTP {$response->status()}");
        }
        
        $data = $response->json();
        
        if (!isset($data['results'][0]['c'])) {
            throw new Exception("Invalid Polygon.io response format");
        }
        
        return [
            'success' => true,
            'price' => floatval($data['results'][0]['c']),
            'source' => 'Polygon.io',
            'timestamp' => now()->toISOString()
        ];
    }
    
    /**
     * Validate price against expected range
     */
    public function validatePrice($symbol, $price, $previousPrice = null)
    {
        if ($price <= 0) {
            return [
                'valid' => false,
                'reason' => 'Price cannot be zero or negative'
            ];
        }
        
        if ($previousPrice && $previousPrice > 0) {
            $changePercent = abs(($price - $previousPrice) / $previousPrice * 100);
            
            // Flag if price changed more than 20% (circuit breaker limit)
            if ($changePercent > 20) {
                return [
                    'valid' => false,
                    'reason' => "Price change too large: {$changePercent}%",
                    'change_percent' => $changePercent
                ];
            }
            
            // Warning if price changed more than 10%
            if ($changePercent > 10) {
                return [
                    'valid' => true,
                    'warning' => "Large price change: {$changePercent}%",
                    'change_percent' => $changePercent
                ];
            }
        }
        
        return [
            'valid' => true,
            'change_percent' => $previousPrice ? abs(($price - $previousPrice) / $previousPrice * 100) : 0
        ];
    }
}