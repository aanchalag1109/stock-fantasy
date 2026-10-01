<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

class StockEyesService
{
    protected $apiKey;
    protected $baseUrl = 'https://api.stockseyes.com/v1/public';

    public function __construct()
    {
        $this->apiKey = env('STOCKEYES_API_KEY');
    }

    public function getQuote(string $tradingSymbol, string $exchange = 'NSE')
    {
        $response = Http::withHeaders([
            'Content-Type' => 'application/json',
            'authorization' => $this->apiKey,
        ])->get("{$this->baseUrl}/quote", [
            'tradingSymbol' => $tradingSymbol,
            'exchange' => $exchange,
        ]);

        return $response->json();
    }

    public function getMultipleQuotes(array $symbols, string $exchange = 'NSE')
    {
        $results = [];
        foreach ($symbols as $symbol) {
            $data = $this->getQuote($symbol, $exchange);
            if (isset($data['tradingSymbol'])) {
                $results[] = [
                    'symbol' => $data['tradingSymbol'],
                    'lastPrice' => $data['lastPrice'],
                    'change' => $data['change'],
                    'volume' => $data['volumeTradedToday'],
                    'open' => $data['ohlc']['open'] ?? null,
                    'high' => $data['ohlc']['high'] ?? null,
                    'low' => $data['ohlc']['low'] ?? null,
                    'close' => $data['ohlc']['close'] ?? null,
                    'status' => 'OK',
                ];
            } else {
                $results[] = [
                    'symbol' => $symbol,
                    'lastPrice' => null,
                    'change' => null,
                    'volume' => null,
                    'open' => null,
                    'high' => null,
                    'low' => null,
                    'close' => null,
                    'status' => 'Error: ' . ($data['message'] ?? 'Unknown error'),
                ];
            }
        }
        return $results;
    }
}