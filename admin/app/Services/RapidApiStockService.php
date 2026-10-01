<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class RapidApiStockService
{
    protected $apiKey;
    protected $baseUrl = 'https://indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com/v1';
    
    public function __construct()
    {
        $this->apiKey = config('services.rapidapi.key', 'b04e026debmsh974ec3b3aeb35d1p154a4ejsnc2f7176fb9b5');
    }

    public function getStockQuote(string $symbol, string $exchange = 'NSE')
    {
        try {
            $response = Http::withHeaders([
                'x-rapidapi-host' => 'indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com',
                'x-rapidapi-key' => $this->apiKey,
            ])->get("{$this->baseUrl}/rapidapi/stock/quote", [
                'tradingSymbol' => $symbol,
                'exchange' => $exchange,
            ]);

            if ($response->successful()) {
                return $response->json();
            }

            Log::error("RapidAPI Stock Error for {$symbol}: " . $response->body());
            return null;
        } catch (\Exception $e) {
            Log::error("RapidAPI Stock Exception for {$symbol}: " . $e->getMessage());
            return null;
        }
    }

    public function getMultipleStocks(array $symbols, string $exchange = 'NSE')
    {
        $results = [];
        foreach ($symbols as $symbol) {
            $data = $this->getStockQuote($symbol, $exchange);
            if ($data) {
                $results[] = [
                    'symbol' => $data['tradingSymbol'] ?? $symbol,
                    'name' => $data['companyName'] ?? $symbol,
                    'price' => $data['lastPrice'] ?? 0,
                    'change' => $data['change'] ?? 0,
                    'change_percent' => $data['pChange'] ?? 0,
                    'volume' => $data['totalTradedVolume'] ?? 0,
                    'open' => $data['open'] ?? 0,
                    'high' => $data['dayHigh'] ?? 0,
                    'low' => $data['dayLow'] ?? 0,
                    'close' => $data['previousClose'] ?? 0,
                    'status' => 'success',
                    'last_updated' => now()
                ];
            } else {
                $results[] = [
                    'symbol' => $symbol,
                    'name' => $symbol,
                    'price' => 0,
                    'change' => 0,
                    'change_percent' => 0,
                    'volume' => 0,
                    'open' => 0,
                    'high' => 0,
                    'low' => 0,
                    'close' => 0,
                    'status' => 'error',
                    'last_updated' => now()
                ];
            }
        }
        return $results;
    }
}