<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class CoinMarketCapService
{
    protected $apiKey = '0c5023c51b4247d3a0a139ee53ce5265';
    protected $baseUrl = 'https://pro-api.coinmarketcap.com/v1';

    public function getCryptoListings(int $limit = 50)
    {
        try {
            $response = Http::withHeaders([
                'Accept' => 'application/json',
                'X-CMC_PRO_API_KEY' => $this->apiKey,
            ])->get("{$this->baseUrl}/cryptocurrency/listings/latest", [
                'limit' => $limit,
                'convert' => 'USD'
            ]);

            if ($response->successful()) {
                $data = $response->json();
                return $this->formatCryptoData($data['data'] ?? []);
            }

            Log::error("CoinMarketCap API Error: " . $response->body());
            return [];
        } catch (\Exception $e) {
            Log::error("CoinMarketCap Exception: " . $e->getMessage());
            return [];
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
}