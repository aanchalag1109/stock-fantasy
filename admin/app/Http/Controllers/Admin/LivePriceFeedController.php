<?php
namespace App\Http\Controllers\Admin;

use Illuminate\Http\Request;
use App\Http\Controllers\Controller;
use App\Services\RapidApiStockService;
use App\Services\CoinMarketCapService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class LivePriceFeedController extends Controller
{
    protected $rapidApiService;
    protected $coinMarketCapService;

    public function __construct()
    {
        $this->rapidApiService = new RapidApiStockService();
        $this->coinMarketCapService = new CoinMarketCapService();
    }

    public function index()
    {
        return view('admin.live_price_feeds.index');
    }

    public function getLivePriceFeeds()
    {
        try {
            $stocks = Cache::remember('live_stocks', 60, function () {
                return $this->getStockData();
            });

            $crypto = Cache::remember('live_crypto', 60, function () {
                return $this->getCryptoData();
            });

            return response()->json([
                'stocks' => $stocks,
                'crypto' => $crypto,
                'last_updated' => now()
            ]);
        } catch (\Exception $e) {
            Log::error('LivePriceFeeds Error: ' . $e->getMessage());
            return response()->json([
                'stocks' => $this->getFallbackStockData(['RELIANCE', 'TCS', 'INFY']),
                'crypto' => $this->getFallbackCryptoData(),
                'last_updated' => now(),
                'error' => 'Using fallback data'
            ]);
        }
    }

    public function getStockData(Request $request = null)
    {
        try {
            // Use RapidAPI for Indian Stock Market Data
            $topStocks = ['RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'KOTAKBANK'];
            $stockData = $this->rapidApiService->getMultipleStocks($topStocks);
            
            if (empty($stockData)) {
                return $this->getFallbackStockData($topStocks);
            }
            
            return $stockData;
        } catch (\Exception $e) {
            Log::error('Stock API Error: ' . $e->getMessage());
            return $this->getFallbackStockData(['RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'SBIN']);
        }
    }

    public function getCryptoData(Request $request = null)
    {
        try {
            // Use CoinMarketCap API
            $cryptoData = $this->coinMarketCapService->getCryptoListings(10);
            
            if (empty($cryptoData)) {
                return $this->getFallbackCryptoData();
            }
            
            return $cryptoData;
        } catch (\Exception $e) {
            Log::error('Crypto API Error: ' . $e->getMessage());
            return $this->getFallbackCryptoData();
        }
    }

    public function getApiStatus()
    {
        $stockStatus = 'unknown';
        $cryptoStatus = 'unknown';
        
        // Test stock API
        try {
            $testStock = $this->rapidApiService->getStockQuote('RELIANCE');
            $stockStatus = $testStock ? 'active' : 'error';
        } catch (\Exception $e) {
            $stockStatus = 'error';
        }
        
        // Test crypto API
        try {
            $testCrypto = $this->coinMarketCapService->getCryptoListings(1);
            $cryptoStatus = !empty($testCrypto) ? 'active' : 'error';
        } catch (\Exception $e) {
            $cryptoStatus = 'error';
        }
        
        return response()->json([
            'stock_api' => [
                'status' => $stockStatus,
                'provider' => 'RapidAPI - Indian Stock Market Data',
                'last_checked' => now()
            ],
            'crypto_api' => [
                'status' => $cryptoStatus,
                'provider' => 'CoinMarketCap Pro API',
                'last_checked' => now()
            ]
        ]);
    }

    private function getFallbackStockData($symbols)
    {
        $fallbackData = [
            'RELIANCE' => ['name' => 'Reliance Industries', 'price' => 2500],
            'TCS' => ['name' => 'Tata Consultancy Services', 'price' => 3200],
            'INFY' => ['name' => 'Infosys', 'price' => 1400],
            'HDFCBANK' => ['name' => 'HDFC Bank', 'price' => 1600],
            'ICICIBANK' => ['name' => 'ICICI Bank', 'price' => 900],
            'SBIN' => ['name' => 'State Bank of India', 'price' => 600],
            'BHARTIARTL' => ['name' => 'Bharti Airtel', 'price' => 800],
            'ITC' => ['name' => 'ITC Limited', 'price' => 450],
            'KOTAKBANK' => ['name' => 'Kotak Mahindra Bank', 'price' => 1800],
            'LT' => ['name' => 'Larsen & Toubro', 'price' => 3000]
        ];
        
        $results = [];
        foreach ($symbols as $symbol) {
            $data = $fallbackData[$symbol] ?? ['name' => $symbol, 'price' => rand(100, 1000)];
            $results[] = [
                'symbol' => $symbol,
                'name' => $data['name'],
                'price' => $data['price'],
                'change' => rand(-50, 50),
                'change_percent' => rand(-5, 5),
                'volume' => rand(100000, 1000000),
                'status' => 'fallback',
                'last_updated' => now()
            ];
        }
        return $results;
    }
    

    
    private function getFallbackCryptoData()
    {
        return [
            ['symbol' => 'BTC', 'name' => 'Bitcoin', 'price' => 45000, 'change_percent' => 2.5, 'market_cap' => 900000000000, 'status' => 'fallback', 'last_updated' => now()],
            ['symbol' => 'ETH', 'name' => 'Ethereum', 'price' => 3000, 'change_percent' => 1.8, 'market_cap' => 360000000000, 'status' => 'fallback', 'last_updated' => now()],
            ['symbol' => 'ADA', 'name' => 'Cardano', 'price' => 0.5, 'change_percent' => -0.5, 'market_cap' => 17000000000, 'status' => 'fallback', 'last_updated' => now()],
            ['symbol' => 'SOL', 'name' => 'Solana', 'price' => 100, 'change_percent' => 3.2, 'market_cap' => 45000000000, 'status' => 'fallback', 'last_updated' => now()],
            ['symbol' => 'DOT', 'name' => 'Polkadot', 'price' => 25, 'change_percent' => -1.2, 'market_cap' => 30000000000, 'status' => 'fallback', 'last_updated' => now()]
        ];
    }
}