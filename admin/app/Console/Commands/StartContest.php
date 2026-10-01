<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Contest;
use App\Models\SavedBasket;
use Illuminate\Support\Facades\Http;

class StartContest extends Command
{
    protected $signature = 'contest:start';
    protected $description = 'Start contests and save initial prices';

    public function handle()
    {
        $now = now();
        
        // Find contests that should start now
        $contests = Contest::where('status', 'upcoming')
            ->where('start_time', '<=', $now)
            ->with('leagueSession')
            ->get();

        foreach ($contests as $contest) {
            $this->info("Starting contest: {$contest->id}");
            
            // Update contest status
            $contest->update(['status' => 'live']);
            
            // Get all saved baskets for this contest
            $baskets = SavedBasket::where('contest_id', $contest->id)->get();
            
            foreach ($baskets as $basket) {
                $this->saveStartingPrices($basket, $contest->leagueSession->market_type ?? 'stock');
            }
            
            // Also update contest_entries table
            $this->saveContestEntriesPrices($contest->id, $contest->leagueSession->market_type ?? 'stock');
        }
    }

    private function saveStartingPrices($basket, $marketType)
    {
        $assets = json_decode($basket->assets, true) ?? [];
        $startingPrices = [];

        foreach ($assets as $asset) {
            $symbol = $asset['symbol'] ?? $asset['name'];
            $price = $this->getCurrentPrice($symbol, $marketType);
            
            $startingPrices[] = [
                'symbol' => $symbol,
                'name' => $asset['name'],
                'starting_price' => $price,
                'direction' => $asset['direction'] ?? 'up',
                'multiplier' => $asset['multiplier'] ?? 1
            ];
        }

        // Save starting prices to basket
        $basket->update([
            'starting_prices' => json_encode($startingPrices),
            'contest_started_at' => now()
        ]);
    }

    private function getCurrentPrice($symbol, $marketType)
    {
        try {
            if ($marketType === 'crypto') {
                return $this->getCryptoPrice($symbol);
            } else {
                return $this->getStockPrice($symbol);
            }
        } catch (\Exception $e) {
            \Log::error("Error fetching price for {$symbol}: " . $e->getMessage());
            return 0;
        }
    }

    private function getCryptoPrice($symbol)
    {
        $response = Http::withHeaders([
            'X-CMC_PRO_API_KEY' => '0c5023c51b4247d3a0a139ee53ce5265'
        ])->get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', [
            'symbol' => $symbol
        ]);

        if ($response->successful()) {
            $data = $response->json();
            return $data['data'][$symbol]['quote']['USD']['price'] ?? 0;
        }
        return 0;
    }

    private function getStockPrice($symbol)
    {
        $response = Http::withHeaders([
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
        return 0;
    }

    private function saveContestEntriesPrices($contestId, $marketType)
    {
        $entries = \DB::table('contest_entries')
            ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
            ->where('contest_entries.contest_id', $contestId)
            ->select('contest_entries.id', 'saved_baskets.assets')
            ->get();

        foreach ($entries as $entry) {
            $assets = json_decode($entry->assets, true) ?? [];
            $startingPrices = [];

            foreach ($assets as $asset) {
                $symbol = $asset['symbol'] ?? $asset['name'];
                $price = $this->getCurrentPrice($symbol, $marketType);
                
                $startingPrices[$symbol] = $price;
            }

            \DB::table('contest_entries')
                ->where('id', $entry->id)
                ->update([
                    'starting_prices' => json_encode($startingPrices),
                    'contest_started_at' => now()
                ]);
        }
    }
}