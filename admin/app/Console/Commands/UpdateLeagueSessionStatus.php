<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\LeagueSession;
use App\Models\Contest;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;

class UpdateLeagueSessionStatus extends Command
{
    protected $signature = 'league:update-status';
    protected $description = 'Update league session status based on current time';

    public function handle()
    {
        $now = Carbon::now();
        
        $this->info("Current Time: " . $now->toDateTimeString());
        
        // Update sessions to 'live' if start_time has passed
        $updatedToLive = LeagueSession::where('status', 'upcoming')
            ->where('start_time', '<=', $now)
            ->where('end_time', '>', $now)
            ->update(['status' => 'live']);
            
        if ($updatedToLive > 0) {
            $this->info("Updated {$updatedToLive} sessions to LIVE");
            
            // Get newly live sessions
            $liveSessions = LeagueSession::where('status', 'live')
                ->where('start_time', '<=', $now)
                ->where('start_time', '>=', $now->copy()->subMinutes(2))
                ->get();
            
            // Start contests for these sessions
            foreach ($liveSessions as $session) {
                $this->info("Starting contests for session: {$session->id}");
                $this->updateContestStatus($session->id, 'live');
                $this->saveSessionAssetStartPrices($session);
                $this->startContestsForSession($session->id);
                $this->generatePrizeDistribution($session->id);
            }
        }
            
        // Update sessions to 'completed' if end_time has passed
        $updatedToCompleted = LeagueSession::where('status', 'live')
            ->where('end_time', '<=', $now)
            ->update(['status' => 'completed']);
            
        if ($updatedToCompleted > 0) {
            $this->info("Updated {$updatedToCompleted} sessions to COMPLETED");
            
            // Get newly completed sessions (within last 5 minutes to catch any missed)
            $completedSessions = LeagueSession::where('status', 'completed')
                ->where('end_time', '<=', $now)
                ->where('end_time', '>=', $now->copy()->subMinutes(5))
                ->get();
            
            // Save end prices for these sessions
            foreach ($completedSessions as $session) {
                $this->info("Saving end prices for session: {$session->id}");
                $this->updateContestStatus($session->id, 'completed');
                $this->saveSessionAssetEndPrices($session);
                $this->saveEndPricesForSession($session->id);
            }
        }
        
        if ($updatedToLive == 0 && $updatedToCompleted == 0) {
            $this->info('No session status updates needed.');
        }
        
        $this->info('League session statuses updated successfully.');
    }

    private function updateContestStatus($sessionId, $status)
    {
        $updated = Contest::where('league_session_id', $sessionId)
            ->update(['status' => $status]);
        
        if ($updated > 0) {
            $this->info("  ✓ Updated {$updated} contests to {$status}");
        }
    }

    private function startContestsForSession($sessionId)
    {
        // Get all contests for this session
        $contests = Contest::where('league_session_id', $sessionId)->get();

        if ($contests->isEmpty()) {
            $this->warn("  No upcoming contests found for session {$sessionId}");
            return;
        }

        $this->info("  Found {$contests->count()} contests to start");

        foreach ($contests as $contest) {
            try {
                $this->info("  ✓ Contest #{$contest->id} processing");

                // Save starting prices for all entries
                $this->saveContestStartingPrices($contest);
                
            } catch (\Exception $e) {
                $this->error("  ✗ Error starting contest #{$contest->id}: " . $e->getMessage());
            }
        }
    }

    private function saveContestStartingPrices($contest)
    {
        $entries = \DB::table('contest_entries')
            ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
            ->where('contest_entries.contest_id', $contest->id)
            ->select('contest_entries.id', 'saved_baskets.assets')
            ->get();

        if ($entries->isEmpty()) return;

        // Pehle session_asset_prices se prices lo (already fetched)
        $sessionPrices = \DB::table('session_asset_prices')
            ->where('league_session_id', $contest->league_session_id)
            ->whereNotNull('start_price')
            ->pluck('start_price', 'asset_symbol');

        $savedCount = 0;
        foreach ($entries as $entry) {
            $assets = json_decode($entry->assets, true) ?? [];
            if (empty($assets)) continue;

            $startingPrices = [];
            foreach ($assets as $asset) {
                $symbol = $asset['symbol'] ?? $asset['name'];
                // Use session price — no extra API call
                if (isset($sessionPrices[$symbol])) {
                    $startingPrices[$symbol] = $sessionPrices[$symbol];
                }
            }

            if (!empty($startingPrices)) {
                \DB::table('contest_entries')->where('id', $entry->id)->update([
                    'starting_prices' => json_encode($startingPrices),
                    'contest_started_at' => now()
                ]);
                $savedCount++;
            }
        }
        $this->info("    Saved starting prices for {$savedCount} entries (from session cache)");
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
            return rand(1000, 5000); // Fallback dummy price
        }
    }

    private function getCryptoPrice($symbol)
    {
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
        return 0;
    }

    private function getStockPrice($symbol)
    {
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
        return 0;
    }

    private function generatePrizeDistribution($sessionId)
    {
        $contests = Contest::where('league_session_id', $sessionId)->get();
        
        foreach ($contests as $contest) {
            $actualParticipants = \DB::table('contest_entries')
                ->where('contest_id', $contest->id)
                ->count();
            
            if ($actualParticipants == 0) continue;
            
            $entryFee = floatval($contest->entry_fee ?? 50);
            $platformFeePercent = floatval($contest->platform_fee ?? 30);
            $winningPercent = floatval($contest->winning_percentage ?? 50);
            
            $totalPool = $actualParticipants * $entryFee;
            $platformFeeAmount = $totalPool * ($platformFeePercent / 100);
            $actualPrizePool = $totalPool - $platformFeeAmount;
            
            $actualWinnersCount = floor($actualParticipants * ($winningPercent / 100));
            if ($actualWinnersCount < 1 && $actualParticipants > 0) $actualWinnersCount = 1;
            
            $distribution = $this->getSimplePrizeTable($actualWinnersCount, $actualPrizePool);
            
            // Delete existing prizes
            \DB::table('contest_performance_prizes')->where('contest_id', $contest->id)->delete();
            
            // Save new prize structure
            foreach ($distribution as $dist) {
                \DB::table('contest_performance_prizes')->insert([
                    'contest_id' => $contest->id,
                    'rank_label' => $dist['label'],
                    'rank_start' => $this->extractRankStart($dist['label']),
                    'rank_end' => $this->extractRankEnd($dist['label']),
                    'winners_count' => $dist['winners'],
                    'percentage' => $dist['percent'],
                    'prize_amount' => $dist['prize'],
                    'per_winner_amount' => $dist['perWinner'],
                    'total_pool' => $totalPool,
                    'platform_fee' => $platformFeeAmount,
                    'prize_pool' => $actualPrizePool,
                    'total_participants' => $actualParticipants,
                    'total_winners' => $actualWinnersCount,
                    'created_at' => now(),
                    'updated_at' => now()
                ]);
            }
            
            $this->info("  ✓ Prize distribution saved for contest #{$contest->id}");
        }
    }

    private function getSimplePrizeTable($totalWinners, $prizePool)
    {
        if ($totalWinners <= 0 || $prizePool <= 0) return [];

        $prizeDistributionTable = [
            10  => [[1,1,30],[2,2,18],[3,3,11],[4,5,13.5],[6,10,27.5]],
            25  => [[1,1,24],[2,2,14],[3,3,9],[4,5,12.375],[6,10,18.125],[11,25,22.5]],
            50  => [[1,1,23],[2,2,13],[3,3,9],[4,5,8.1],[6,10,15],[11,25,16.4],[26,50,15.5]],
            100 => [[1,1,18],[2,2,10],[3,3,8],[4,5,6.576],[6,10,10],[11,25,15.4],[26,50,16.524],[51,100,15.5]],
            250 => [[1,1,14],[2,2,9],[3,3,7],[4,5,5.169],[6,10,8.602],[11,25,13.323],[26,50,13.031],[51,100,13.375],[101,250,16.5]],
            500 => [[1,1,14],[2,2,9],[3,3,7],[4,5,3.1],[6,10,6.628],[11,25,10.576],[26,50,10.102],[51,100,12.469],[101,250,13.625],[251,500,13.5]],
            1000=> [[1,1,12],[2,2,8],[3,3,5],[4,5,2.399],[6,10,4.931],[11,25,9.11],[26,50,8.813],[51,100,10.418],[101,250,11.891],[251,500,12.188],[501,1000,15.25]],
            2500=> [[1,1,10],[2,2,7],[3,3,5],[4,5,1.8],[6,10,3.5],[11,25,7.386],[26,50,7.229],[51,100,8.972],[101,250,10.629],[251,500,11.172],[501,1000,12.562],[1001,2500,14.75]],
            5000=> [[1,1,10],[2,2,7],[3,3,5],[4,5,1.75],[6,10,3],[11,25,5.314],[26,50,5.355],[51,100,7.14],[101,250,8.853],[251,500,9.471],[501,1000,10.961],[1001,2500,12.281],[2501,5000,13.875]],
            10000=> [[1,1,10],[2,2,7],[3,3,5],[4,5,1.6],[6,10,2.049],[11,25,4.283],[26,50,4.31],[51,100,5.08],[101,500,8.774],[501,1000,10.365],[1001,2500,12.82],[2501,5000,12.094],[5001,10000,16.625]],
            25000=> [[1,1,8],[2,2,6],[3,3,4.5],[4,5,1.4],[6,10,1.7],[11,25,3.164],[26,50,3.422],[51,100,4.229],[101,500,6.262],[501,1000,7.339],[1001,5000,12.172],[5001,10000,12.562],[10001,25000,29.25]],
            50000=> [[1,1,8],[2,2,6],[3,3,4.5],[4,5,1.2],[6,10,1.7],[11,25,2.903],[26,50,3.043],[51,100,3.89],[101,500,6.187],[501,1000,6.916],[1001,5000,8.555],[5001,10000,10],[10001,25000,17.431],[25001,50000,19.675]],
            100000=> [[1,1,8],[2,2,6],[3,3,4.5],[4,5,1.052],[6,10,1.502],[11,25,2.737],[26,50,2.65],[51,100,3.533],[101,500,5.377],[501,1000,5.1],[1001,5000,7.893],[5001,10000,8.45],[10001,25000,11.031],[25001,50000,12.375],[50001,100000,19.8]],
            250000=> [[1,1,6.5],[2,2,5],[3,3,4],[4,5,1.076],[6,10,1.8],[11,25,2.53],[26,50,2.507],[51,100,3.11],[101,500,5],[501,1000,6],[1001,5000,7.075],[5001,10000,7.766],[10001,25000,8.355],[25001,100000,13.281],[100001,250000,26]],
            500000=> [[1,1,6.5],[2,2,5],[3,3,4],[4,5,1.005],[6,10,1.673],[11,25,2.831],[26,50,2.375],[51,100,2.9],[101,500,4.6],[501,1000,5.6],[1001,5000,6.788],[5001,10000,7.532],[10001,25000,7.734],[25001,100000,9.312],[100001,250000,12.75],[250001,500000,19.4]],
            1000000=> [[1,1,5.5],[2,2,4.2],[3,3,3.5],[4,5,0.941],[6,10,1.621],[11,25,2.194],[26,50,2.159],[51,100,2.812],[101,500,4.538],[501,1000,5.2],[1001,5000,6.555],[5001,10000,7.407],[10001,25000,7.709],[25001,100000,8.945],[100001,250000,11.594],[250001,500000,13.125],[500001,1000000,12]],
        ];

        // Find closest key (nearest lower or equal)
        $keys = array_keys($prizeDistributionTable);
        sort($keys);
        $chosenKey = $keys[0];
        foreach ($keys as $k) {
            if ($k <= $totalWinners) $chosenKey = $k;
        }

        $groups = $prizeDistributionTable[$chosenKey];
        $distribution = [];
        $lastGroup = end($groups);

        foreach ($groups as $idx => $group) {
            [$start, $end, $pct] = $group;
            if ($start > $totalWinners) break;

            $isLast = ($idx === count($groups) - 1);

            // Last tier: always extend to actual winners
            if ($isLast) {
                $end = $totalWinners;
            } else {
                $end = min($end, $totalWinners);
            }

            if ($end < $start) break;

            $numInGroup  = $end - $start + 1;
            $groupPrize  = $prizePool * ($pct / 100);
            $perPerson   = $numInGroup > 0 ? $groupPrize / $numInGroup : 0;

            $distribution[] = [
                'label'     => "Ranks {$start}-{$end}",
                'winners'   => $numInGroup,
                'percent'   => $pct,
                'prize'     => $groupPrize,
                'perWinner' => $perPerson,
            ];

            if ($end >= $totalWinners) break;
        }

        // If actual winners > max key, add remaining with last tier's %
        $lastDist = end($distribution);
        if ($lastDist && $lastDist['label'] !== "Ranks {$totalWinners}-{$totalWinners}") {
            // Check if last dist covers all winners
            preg_match('/Ranks \d+-(\d+)/', $lastDist['label'], $m);
            $coveredEnd = isset($m[1]) ? intval($m[1]) : 0;
            if ($coveredEnd < $totalWinners) {
                $extraStart = $coveredEnd + 1;
                $extraEnd   = $totalWinners;
                $extraCnt   = $extraEnd - $extraStart + 1;
                $lastPct    = $lastGroup[2];
                $extraPrize = $prizePool * ($lastPct / 100);
                $distribution[] = [
                    'label'     => "Ranks {$extraStart}-{$extraEnd}",
                    'winners'   => $extraCnt,
                    'percent'   => $lastPct,
                    'prize'     => $extraPrize,
                    'perWinner' => $extraCnt > 0 ? $extraPrize / $extraCnt : 0,
                ];
            }
        }

        return $distribution;
    }

    private function extractRankStart($label)
    {
        if (preg_match('/Ranks (\d+)-/', $label, $matches)) {
            return intval($matches[1]);
        }
        return 1;
    }

    private function extractRankEnd($label)
    {
        if (preg_match('/Ranks \d+-(\d+)/', $label, $matches)) {
            return intval($matches[1]);
        }
        return 1;
    }

    private function saveSessionAssetStartPrices($session)
    {
        $assets = \DB::table('league_session_assets')
            ->where('league_session_id', $session->id)
            ->distinct()->pluck('asset_symbol');

        $marketType = $session->market_type ?? 'stock';

        foreach ($assets as $symbol) {
            $exists = \DB::table('session_asset_prices')
                ->where('league_session_id', $session->id)
                ->where('asset_symbol', $symbol)
                ->whereNotNull('start_price')
                ->exists();

            if ($exists) continue;

            usleep(500000);
            $price = $this->getCurrentPrice($symbol, $marketType);

            \DB::table('session_asset_prices')->updateOrInsert(
                ['league_session_id' => $session->id, 'asset_symbol' => $symbol],
                [
                    'start_price' => $price > 0 ? $price : null,
                    'start_price_fetched_at' => now(),
                    'updated_at' => now(),
                    'created_at' => now()
                ]
            );
            $this->info("  Start price for {$symbol}: " . ($price > 0 ? $price : 'FAILED'));
        }
    }

    private function saveSessionAssetEndPrices($session)
    {
        $assets = \DB::table('league_session_assets')
            ->where('league_session_id', $session->id)
            ->distinct()->pluck('asset_symbol');

        $marketType = $session->market_type ?? 'stock';

        foreach ($assets as $symbol) {
            usleep(500000);
            $price = $this->getCurrentPrice($symbol, $marketType);

            if ($price > 0) {
                \DB::table('session_asset_prices')->updateOrInsert(
                    ['league_session_id' => $session->id, 'asset_symbol' => $symbol],
                    [
                        'end_price' => $price,
                        'end_price_fetched_at' => now(),
                        'updated_at' => now(),
                        'created_at' => now()
                    ]
                );
                $this->info("  End price for {$symbol}: {$price}");
            } else {
                $this->warn("  End price FAILED for {$symbol}");
            }
        }
    }

    private function saveEndPricesForSession($sessionId)
    {
        $contests = Contest::where('league_session_id', $sessionId)->get();
        
        foreach ($contests as $contest) {
            $this->saveContestEndPrices($contest);
        }
    }

    private function saveContestEndPrices($contest)
    {
        $entries = \DB::table('contest_entries')
            ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
            ->where('contest_entries.contest_id', $contest->id)
            ->select('contest_entries.id', 'saved_baskets.assets')
            ->get();

        if ($entries->isEmpty()) return;

        // Pehle session_asset_prices se end prices lo (already fetched)
        $sessionPrices = \DB::table('session_asset_prices')
            ->where('league_session_id', $contest->league_session_id)
            ->whereNotNull('end_price')
            ->pluck('end_price', 'asset_symbol');

        $savedCount = 0;
        foreach ($entries as $entry) {
            $assets = json_decode($entry->assets, true) ?? [];
            if (empty($assets)) continue;

            $endingPrices = [];
            foreach ($assets as $asset) {
                $symbol = $asset['symbol'] ?? $asset['name'];
                if (isset($sessionPrices[$symbol])) {
                    $endingPrices[$symbol] = $sessionPrices[$symbol];
                }
            }

            if (!empty($endingPrices)) {
                \DB::table('contest_entries')->where('id', $entry->id)->update([
                    'ending_prices' => json_encode($endingPrices),
                    'contest_ended_at' => now()
                ]);
                $savedCount++;
            }
        }
        $this->info("    Saved ending prices for {$savedCount} entries (from session cache)");
    }
}