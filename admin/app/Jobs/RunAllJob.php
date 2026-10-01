<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;
use Carbon\Carbon;

class RunAllJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $timeout = 14400; // 4 hours
    public $tries   = 1;

    public function __construct(
        public int    $contestId,
        public string $startTime,
        public string $endTime
    ) {}

    public function handle()
    {
        $logKey = 'run_all_log_' . $this->contestId;
        $log    = [];

        $addLog = function($msg) use ($logKey, &$log) {
            $log[] = $msg;
            Cache::put($logKey, ['status' => 'running', 'log' => $log], 7200);
        };

        try {
            $contest = DB::table('contests')
                ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
                ->select('contests.*', 'league_sessions.market_type')
                ->where('contests.id', $this->contestId)
                ->first();

            if (!$contest) throw new \Exception('Contest not found');

            $sessionId  = $contest->league_session_id;
            $marketType = $contest->market_type ?? 'stock';
            $today      = now()->format('Y-m-d');
            $startDT    = Carbon::parse($today . ' ' . $this->startTime);
            $endDT      = Carbon::parse($today . ' ' . $this->endTime);

            // Wait until start_time
            $waitStart = now()->diffInSeconds($startDT, false);
            if ($waitStart > 0) {
                $addLog("Waiting for start time: {$this->startTime} ({$waitStart}s)");
                sleep($waitStart);
            }

            // Phase 1: Start prices - wait until ALL assets have prices
            $totalAssets = DB::table('league_session_assets')->where('league_session_id', $sessionId)->count();
            $addLog("Phase 1: Fetching start prices for {$totalAssets} assets...");

            $attempt = 0;
            $maxAttempts = 10;
            while ($attempt < $maxAttempts) {
                $attempt++;
                $startSaved = $this->fetchAndSaveStartPrices($sessionId, $marketType);
                $addLog("Attempt {$attempt}: {$startSaved}/{$totalAssets} prices saved");

                if ($startSaved >= $totalAssets) break;

                $missing = $totalAssets - $startSaved;
                $addLog("Still missing {$missing} prices, retrying in 10s...");
                sleep(10);
            }

            $finalSaved = DB::table('session_asset_prices')->where('league_session_id', $sessionId)->whereNotNull('start_price')->count();
            if ($finalSaved < $totalAssets) {
                throw new \Exception("Could not fetch all start prices after {$maxAttempts} attempts. Got {$finalSaved}/{$totalAssets}. Aborting.");
            }

            DB::table('league_sessions')->where('id', $sessionId)->update(['status' => 'live', 'start_time' => $startDT]);
            DB::table('contests')->where('league_session_id', $sessionId)->update(['status' => 'live']);
            $addLog('All prices saved. Session LIVE');

            // Wait until end_time
            $waitEnd = now()->diffInSeconds($endDT, false);
            if ($waitEnd > 0) {
                $addLog("Waiting for end time: {$this->endTime} ({$waitEnd}s)");
                sleep($waitEnd);
            }

            // Phase 2: End prices
            $addLog('Phase 2: Fetching end prices...');
            $endSaved = $this->fetchAndSaveEndPrices($sessionId, $marketType);
            $addLog("End prices saved: {$endSaved}");

            // Phase 3a: Scores
            $addLog('Phase 3a: Calculating scores...');
            $calculated = $this->calculateScores($this->contestId, $sessionId);
            $addLog("Scores calculated: {$calculated} entries");

            // Phase 3b: Prizes
            $addLog('Phase 3b: Distributing prizes...');
            $distributed = $this->distributePrizes($this->contestId);
            $addLog("Prizes distributed: {$distributed} winners");

            // Phase 4: Complete
            $addLog('Phase 4: Marking completed...');
            DB::table('contests')->where('league_session_id', $sessionId)->whereIn('status', ['live', 'upcoming'])->update(['status' => 'completed']);
            DB::table('league_sessions')->where('id', $sessionId)->update(['status' => 'completed', 'end_time' => $endDT]);
            $addLog('DONE - Session completed!');

            Cache::put($logKey, ['status' => 'done', 'log' => $log], 3600);

        } catch (\Exception $e) {
            Log::error('RunAllJob failed: ' . $e->getMessage());
            $log[] = 'Error: ' . $e->getMessage();
            Cache::put($logKey, ['status' => 'failed', 'log' => $log], 3600);
        }
    }

    private function fetchAndSaveStartPrices($sessionId, $marketType)
    {
        $assets = DB::table('league_session_assets')->where('league_session_id', $sessionId)->pluck('asset_symbol');
        $saved  = 0;
        $failed = [];

        foreach ($assets as $symbol) {
            $exists = DB::table('session_asset_prices')->where('league_session_id', $sessionId)->where('asset_symbol', $symbol)->whereNotNull('start_price')->exists();
            if ($exists) { $saved++; continue; }
            usleep(500000);
            $price = $this->getPrice($symbol, $marketType);
            if ($price > 0) {
                DB::table('session_asset_prices')->updateOrInsert(
                    ['league_session_id' => $sessionId, 'asset_symbol' => $symbol],
                    ['start_price' => $price, 'start_price_fetched_at' => now(), 'updated_at' => now(), 'created_at' => now()]
                );
                $saved++;
            } else {
                $failed[] = $symbol;
                Log::warning("Start price fetch failed for {$symbol}, will retry");
            }
        }

        // Retry failed assets once after 5 seconds
        if (!empty($failed)) {
            sleep(5);
            foreach ($failed as $symbol) {
                $price = $this->getPrice($symbol, $marketType);
                if ($price > 0) {
                    DB::table('session_asset_prices')->updateOrInsert(
                        ['league_session_id' => $sessionId, 'asset_symbol' => $symbol],
                        ['start_price' => $price, 'start_price_fetched_at' => now(), 'updated_at' => now(), 'created_at' => now()]
                    );
                    $saved++;
                } else {
                    Log::error("Start price retry also failed for {$symbol}");
                }
            }
        }

        return $saved;
    }

    private function fetchAndSaveEndPrices($sessionId, $marketType)
    {
        $assets = DB::table('league_session_assets')->where('league_session_id', $sessionId)->pluck('asset_symbol');
        $saved  = 0;
        foreach ($assets as $symbol) {
            usleep(500000);
            $price = $this->getPrice($symbol, $marketType);
            if ($price <= 0) continue;
            DB::table('session_asset_prices')->updateOrInsert(
                ['league_session_id' => $sessionId, 'asset_symbol' => $symbol],
                ['end_price' => $price, 'end_price_fetched_at' => now(), 'updated_at' => now(), 'created_at' => now()]
            );
            $saved++;
        }
        return $saved;
    }

    private function calculateScores($contestId, $sessionId)
    {
        $startPrices = DB::table('session_asset_prices')->where('league_session_id', $sessionId)->whereNotNull('start_price')->pluck('start_price', 'asset_symbol');
        $endPrices   = DB::table('session_asset_prices')->where('league_session_id', $sessionId)->whereNotNull('end_price')->pluck('end_price', 'asset_symbol');
        $entries     = DB::table('contest_entries')->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')->where('contest_entries.contest_id', $contestId)->select('contest_entries.id', 'saved_baskets.assets', 'saved_baskets.multipliers')->get();

        $processed = 0;
        foreach ($entries as $entry) {
            $assets      = json_decode($entry->assets ?? '[]', true) ?: [];
            $multipliers = json_decode($entry->multipliers ?? '[]', true) ?: [];
            $totalScore  = 0;
            foreach ($assets as $i => $asset) {
                $symbol     = $asset['symbol'] ?? $asset['name'] ?? null;
                $mData      = $multipliers[$i] ?? ['multiplier' => 1, 'prediction' => 'UP'];
                $multiplier = is_array($mData) ? ($mData['multiplier'] ?? 1) : $mData;
                $prediction = strtoupper(is_array($mData) ? ($mData['prediction'] ?? 'UP') : 'UP');
                if (!$symbol || !isset($startPrices[$symbol], $endPrices[$symbol])) continue;
                $start = floatval($startPrices[$symbol]);
                $end   = floatval($endPrices[$symbol]);
                if ($start <= 0) continue;
                $changePct   = (($end - $start) / $start) * 100;
                $directional = $prediction === 'UP' ? ($changePct > 0 ? $changePct : -abs($changePct)) : ($changePct < 0 ? abs($changePct) : -$changePct);
                $totalScore += round($directional * $multiplier, 2) * 100;
            }
            DB::table('contest_entries')->where('id', $entry->id)->update(['total_score' => $totalScore, 'updated_at' => now()]);
            $processed++;
        }

        $sorted = DB::table('contest_entries')->where('contest_id', $contestId)->orderByDesc('total_score')->pluck('id');
        foreach ($sorted as $rank => $id) {
            DB::table('contest_entries')->where('id', $id)->update(['rank' => $rank + 1]);
        }
        return $processed;
    }

    private function distributePrizes($contestId)
    {
        $existing = DB::table('transactions')->where('contest_id', $contestId)->where('type', 'winnings')->where('status', 'success')->exists();
        if ($existing) return 0;

        $prizes = DB::table('contest_performance_prizes')->where('contest_id', $contestId)->orderBy('rank_start')->get();
        if ($prizes->isEmpty()) return 0;

        $entries     = DB::table('contest_entries')->where('contest_id', $contestId)->orderBy('rank')->get();
        $distributed = 0;
        foreach ($entries as $entry) {
            $rank = $entry->rank ?? 0;
            foreach ($prizes as $prize) {
                if ($rank >= $prize->rank_start && $rank <= $prize->rank_end) {
                    $amount = floatval($prize->per_winner_amount);
                    if ($amount <= 0) break;
                    DB::table('transactions')->insert([
                        'user_id' => $entry->user_id, 'contest_id' => $contestId, 'type' => 'winnings',
                        'amount' => $amount, 'status' => 'success',
                        'transaction_id' => 'PRIZE_' . $contestId . '_' . $entry->id . '_' . time() . '_' . rand(1000, 9999),
                        'description' => "Prize for Contest #{$contestId}, rank {$rank}",
                        'created_at' => now(), 'updated_at' => now(),
                    ]);
                    DB::table('users')->where('id', $entry->user_id)->increment('winnings_balance', $amount);
                    $distributed++;
                    break;
                }
            }
        }
        DB::table('contests')->where('id', $contestId)->update(['prizes_distributed' => 1]);
        return $distributed;
    }

    private function getPrice($symbol, $marketType, int $retries = 3)
    {
        for ($i = 1; $i <= $retries; $i++) {
            try {
                if ($marketType === 'crypto') {
                    $r = Http::timeout(15)->retry(2, 2000)->withHeaders(['X-CMC_PRO_API_KEY' => '0c5023c51b4247d3a0a139ee53ce5265'])->get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', ['symbol' => str_replace('-USD', '', $symbol)]);
                    if ($r->successful()) {
                        $price = $r->json()['data'][str_replace('-USD', '', $symbol)]['quote']['USD']['price'] ?? 0;
                        if ($price > 0) return $price;
                    }
                } else {
                    $r = Http::timeout(15)->retry(2, 2000)->withHeaders(['x-rapidapi-host' => 'indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com', 'x-rapidapi-key' => config('services.rapidapi.key', 'b04e026debmsh974ec3b3aeb35d1p154a4ejsnc2f7176fb9b5')])->get('https://indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com/v1/rapidapi/stock/quote', ['tradingSymbol' => $symbol, 'exchange' => 'NSE']);
                    if ($r->successful()) {
                        $price = $r->json()['lastPrice'] ?? 0;
                        if ($price > 0) return $price;
                    }
                }
            } catch (\Exception $e) {
                Log::warning("Price fetch attempt {$i}/{$retries} failed for {$symbol}: " . $e->getMessage());
            }
            if ($i < $retries) sleep(3);
        }
        return 0;
    }
}
