<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Contest;
use App\Models\SavedBasket;
use Illuminate\Support\Facades\Http;

class UpdateScores extends Command
{
    protected $signature = 'contest:update-scores';
    protected $description = 'Update contest scores based on current prices';

    public function handle()
    {
        // Find live contests
        $contests = Contest::where('status', 'live')
            ->with('leagueSession')
            ->get();

        foreach ($contests as $contest) {
            $this->info("Updating scores for contest: {$contest->id}");
            
            // Get all baskets for this contest
            $baskets = SavedBasket::where('contest_id', $contest->id)
                ->whereNotNull('starting_prices')
                ->get();
            
            foreach ($baskets as $basket) {
                $this->updateBasketScore($basket, $contest->leagueSession->market_type ?? 'stock');
            }
            
            // Update contest_entries scores
            $this->updateContestEntriesScores($contest->id, $contest->leagueSession->market_type ?? 'stock');
            
            // Update leaderboard rankings
            $this->updateLeaderboard($contest->id);
        }
    }

    private function updateBasketScore($basket, $marketType)
    {
        $startingPrices = json_decode($basket->starting_prices, true) ?? [];
        $totalScore = 0;

        foreach ($startingPrices as $asset) {
            $currentPrice = $this->getCurrentPrice($asset['symbol'], $marketType);
            $startingPrice = $asset['starting_price'];
            $direction = $asset['direction'];
            $multiplier = $asset['multiplier'] ?? 1;

            if ($startingPrice > 0 && $currentPrice > 0) {
                $priceChange = (($currentPrice - $startingPrice) / $startingPrice) * 100;
                
                // Calculate score based on direction prediction
                if ($direction === 'up' && $priceChange > 0) {
                    $score = $priceChange * $multiplier;
                } elseif ($direction === 'down' && $priceChange < 0) {
                    $score = abs($priceChange) * $multiplier;
                } else {
                    $score = $priceChange * $multiplier; // Loss if wrong direction
                }
                
                $totalScore += $score;
            }
        }

        // Update basket score
        $basket->update(['total_score' => $totalScore]);
    }

    private function updateLeaderboard($contestId)
    {
        $baskets = SavedBasket::where('contest_id', $contestId)
            ->orderBy('total_score', 'desc')
            ->get();

        $rank = 1;
        foreach ($baskets as $basket) {
            $basket->update(['rank' => $rank]);
            $rank++;
        }
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
            \Log::error("Error fetching current price for {$symbol}: " . $e->getMessage());
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

    private function updateContestEntriesScores($contestId, $marketType)
    {
        $entries = \DB::table('contest_entries')
            ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
            ->where('contest_entries.contest_id', $contestId)
            ->whereNotNull('contest_entries.starting_prices')
            ->select('contest_entries.id', 'contest_entries.starting_prices', 'saved_baskets.assets', 'saved_baskets.multipliers')
            ->get();

        foreach ($entries as $entry) {
            $startingPrices = json_decode($entry->starting_prices, true) ?? [];
            $assets = json_decode($entry->assets, true) ?? [];
            $multipliers = json_decode($entry->multipliers, true) ?? [];
            $totalScore = 0;

            foreach ($assets as $index => $asset) {
                $symbol = $asset['symbol'] ?? $asset['name'];
                $startPrice = $startingPrices[$symbol] ?? 0;
                $currentPrice = $this->getCurrentPrice($symbol, $marketType);
                
                $multiplier = $multipliers[$index]['multiplier'] ?? 1;
                $direction = $multipliers[$index]['prediction'] ?? 'UP';

                if ($startPrice > 0 && $currentPrice > 0) {
                    $priceChange = (($currentPrice - $startPrice) / $startPrice) * 100;
                    
                    if ($direction === 'DOWN') {
                        $score = (-$priceChange) * $multiplier;
                    } else {
                        $score = $priceChange * $multiplier;
                    }
                    
                    $totalScore += $score;
                }
            }

            \DB::table('contest_entries')
                ->where('id', $entry->id)
                ->update(['total_score' => $totalScore]);
        }
    }
}