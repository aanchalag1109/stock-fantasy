<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class UpdateContestScoresManual extends Command
{
    protected $signature = 'contest:update-scores-manual {contestId}';
    protected $description = 'Manually update scores for a specific contest';

    public function handle()
    {
        $contestId = $this->argument('contestId');
        
        $contest = DB::table('contests')->where('id', $contestId)->first();
        
        if (!$contest) {
            $this->error("Contest #{$contestId} not found");
            return 1;
        }
        
        $session = DB::table('league_sessions')->where('id', $contest->league_session_id)->first();
        
        if (!$session) {
            $this->error("Session not found for contest #{$contestId}");
            return 1;
        }
        
        $this->info("Updating scores for contest #{$contestId}...");
        $this->updateContestScores($contestId, $session->market_type);
        $this->info("✓ Contest #{$contestId} scores updated successfully!");
        
        return 0;
    }

    private function updateContestScores($contestId, $marketType)
    {
        $entries = DB::table('contest_entries as ce')
            ->leftJoin('saved_baskets as sb', 'ce.basket_id', '=', 'sb.id')
            ->where('ce.contest_id', $contestId)
            ->whereNotNull('ce.starting_prices')
            ->select('ce.id', 'ce.starting_prices', 'sb.assets', 'sb.multipliers')
            ->get();

        foreach ($entries as $entry) {
            $startPrices = json_decode($entry->starting_prices, true) ?? [];
            $assets = json_decode($entry->assets, true) ?? [];
            $multipliers = json_decode($entry->multipliers, true) ?? [];
            
            $totalScore = 0;

            foreach ($assets as $index => $asset) {
                $symbol = $asset['symbol'] ?? $asset['name'];
                $startPrice = $startPrices[$symbol] ?? 0;
                
                if ($startPrice <= 0) continue;
                
                $currentPrice = $this->getCurrentPrice($symbol, $marketType);
                
                if ($currentPrice <= 0) continue;
                
                $priceChangePercent = (($currentPrice - $startPrice) / $startPrice) * 100;
                $prediction = $multipliers[$index]['prediction'] ?? 'UP';
                $multiplier = $multipliers[$index]['multiplier'] ?? 1;
                
                $directionalPercent = ($prediction === 'DOWN') ? -$priceChangePercent : $priceChangePercent;
                $weightedPercent = $directionalPercent * $multiplier;
                $points = round($weightedPercent, 2) * 100;
                
                $totalScore += $points;
            }

            DB::table('contest_entries')
                ->where('id', $entry->id)
                ->update(['total_score' => round($totalScore, 2)]);
        }

        $this->assignRanks($contestId);
    }

    private function assignRanks($contestId)
    {
        $entries = DB::table('contest_entries')
            ->where('contest_id', $contestId)
            ->orderBy('total_score', 'desc')
            ->orderBy('created_at', 'asc')
            ->get();

        $currentRank = 1;
        $previousScore = null;

        foreach ($entries as $index => $entry) {
            if ($previousScore !== null && $entry->total_score == $previousScore) {
                // Same rank
            } else {
                $currentRank = $index + 1;
            }

            DB::table('contest_entries')
                ->where('id', $entry->id)
                ->update(['rank' => $currentRank]);

            $previousScore = $entry->total_score;
        }
    }

    private function getCurrentPrice($symbol, $marketType)
    {
        try {
            if ($marketType === 'crypto') {
                $response = Http::timeout(5)->withHeaders([
                    'X-CMC_PRO_API_KEY' => '0c5023c51b4247d3a0a139ee53ce5265'
                ])->get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', [
                    'symbol' => str_replace('-USD', '', $symbol)
                ]);

                if ($response->successful()) {
                    $data = $response->json();
                    $cleanSymbol = str_replace('-USD', '', $symbol);
                    return $data['data'][$cleanSymbol]['quote']['USD']['price'] ?? 0;
                }
            } else {
                $response = Http::timeout(5)->withHeaders([
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
            }
        } catch (\Exception $e) {
            \Log::error("Error fetching price for {$symbol}: " . $e->getMessage());
        }
        
        return 0;
    }
}
